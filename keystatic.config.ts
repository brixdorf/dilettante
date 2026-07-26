import { collection, config, fields } from "@keystatic/core";
import { DEFAULT_SCHEMA, Type } from "js-yaml";

const BLOG_DIRECTORY = "src/content/blog";

class RawYaml {
  constructor(readonly source: string) {}
}

class ImageCreditPart {
  constructor(readonly source: string | undefined) {}
}

const raw = (source: string) => new RawYaml(source);

const quoted = (value: string) => raw(JSON.stringify(value));

const isBlank = (value: string | null | undefined) =>
  value === null || value === undefined || value.trim() === "";

const IMAGE_CREDIT_KEYS = ["caption", "author", "authorUrl", "source", "sourceUrl"] as const;

const IMAGE_CREDIT_REQUIRED_KEYS = ["author", "authorUrl", "sourceUrl"] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isImageCredit = (value: unknown) =>
  isPlainObject(value) &&
  Object.keys(value).length === IMAGE_CREDIT_KEYS.length &&
  IMAGE_CREDIT_KEYS.every((key) => value[key] instanceof ImageCreditPart);

const representImageCredit = (value: Record<string, unknown>): string | undefined => {
  const entries = IMAGE_CREDIT_KEYS.map(
    (key) => [key, (value[key] as ImageCreditPart).source] as const,
  );
  const filled = new Map(entries);

  if (IMAGE_CREDIT_REQUIRED_KEYS.some((key) => filled.get(key) === undefined)) return undefined;

  return entries
    .filter(([, source]) => source !== undefined)
    .map(([key, source]) => `\n  ${key}: ${source}`)
    .join("");
};

const REGISTERED = Symbol.for("dilettante.keystatic.yaml-types");
const globalScope = globalThis as unknown as Record<symbol, boolean>;

if (!globalScope[REGISTERED]) {
  globalScope[REGISTERED] = true;
  DEFAULT_SCHEMA.compiledImplicit.unshift(
    new Type("tag:yaml.org,2002:str", {
      kind: "scalar",
      resolve: () => false,
      predicate: (value) => value instanceof RawYaml,
      represent: (value) => (value as RawYaml).source,
    }),

    new Type("tag:yaml.org,2002:seq", {
      kind: "sequence",
      resolve: () => false,
      predicate: (value) => Array.isArray(value) && value.every((item) => item instanceof RawYaml),
      represent: (value) => {
        const items = value as RawYaml[];
        return items.length === 0
          ? (undefined as unknown as string)
          : `[${items.map((item) => item.source).join(", ")}]`;
      },
    }),
    new Type("tag:yaml.org,2002:map", {
      kind: "mapping",
      resolve: () => false,
      predicate: isImageCredit,
      represent: (value) =>
        representImageCredit(value as Record<string, unknown>) as unknown as string,
    }),
  );
}

type Serialized = RawYaml | ImageCreditPart | undefined;

const serializingAs = <Field extends { serialize: (...args: never[]) => unknown }>(
  field: Field,
  serialize: (value: never) => Serialized,
): Field => ({ ...field, serialize: (value: never) => ({ value: serialize(value) }) }) as Field;

const text = (options: {
  label: string;
  description?: string;
  multiline?: boolean;
  defaultValue?: string;
  required?: boolean;
}) => {
  const field = fields.text({
    label: options.label,
    description: options.description,
    multiline: options.multiline,
    defaultValue: options.defaultValue,
    validation: options.required ? { isRequired: true } : undefined,
  });
  return serializingAs(field, (value: string) =>
    options.required ? quoted(value) : isBlank(value) ? undefined : quoted(value),
  );
};

const url = (options: { label: string; description?: string; required?: boolean }) => {
  const field = fields.url({
    label: options.label,
    description: options.description,
    validation: options.required ? { isRequired: true as const } : undefined,
  });
  return serializingAs(field, (value: string | null) =>
    isBlank(value) ? undefined : quoted(value as string),
  );
};

const date = (options: { label: string; description?: string; required?: boolean }) => {
  const field = fields.date({
    label: options.label,
    description: options.description,
    defaultValue: options.required ? { kind: "today" as const } : undefined,
    validation: options.required ? { isRequired: true as const } : undefined,
  });
  return serializingAs(field, (value: string | null) => (value === null ? undefined : raw(value)));
};

const positiveInteger = (options: { label: string; description?: string }) => {
  const field = fields.integer({
    label: options.label,
    description: options.description,
    validation: { min: 1 },
  });
  return serializingAs(field, (value: number | null) =>
    value === null ? undefined : raw(String(value)),
  );
};

const flag = (options: { label: string; description?: string }) => {
  const field = fields.checkbox({ label: options.label, description: options.description });
  return serializingAs(field, (value: boolean) => (value ? raw("true") : undefined));
};

const creditPart = (options: {
  kind?: "text" | "url";
  label: string;
  description?: string;
  defaultValue?: string;
}) => {
  const field =
    options.kind === "url"
      ? fields.url({ label: options.label, description: options.description })
      : fields.text({
          label: options.label,
          description: options.description,
          defaultValue: options.defaultValue,
        });
  return serializingAs(
    field,
    (value: string | null) =>
      new ImageCreditPart(isBlank(value) ? undefined : JSON.stringify(value)),
  );
};

const sanitizeFilename = (filename: string) => {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot).toLowerCase() : "";
  const stem = base
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${stem || "image"}${extension}`;
};

const entryImage = (options: { label: string; description?: string; required?: boolean }) => {
  const field = fields.image({
    label: options.label,
    description: options.description,
    validation: options.required ? { isRequired: true as const } : undefined,
    transformFilename: sanitizeFilename,
  });
  const stripPrefix = (value: unknown) =>
    typeof value === "string" ? value.replace(/^\.\//, "") : value;

  return {
    ...field,
    filename: (value: never, args: never) => field.filename(stripPrefix(value) as never, args),
    parse: (value: never, args: never) => field.parse(stripPrefix(value) as never, args),
    serialize: (value: never, args: { suggestedFilenamePrefix?: string; slug?: string }) => {
      const output = field.serialize(value, {
        ...args,
        suggestedFilenamePrefix: undefined,
      } as never);
      if (output.value === undefined) return output;
      return { value: raw(`./${output.value}`), asset: output.asset };
    },
    reader: { parse: (value: never) => field.reader.parse(stripPrefix(value) as never) },
  } as typeof field;
};

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const MARKDOWN_IMAGE_TARGET = /(!\[(?:\\.|[^\\\]])*\]\()([^)\s]+)/g;
const NOT_ENTRY_RELATIVE = /^(?:[a-zA-Z][a-zA-Z\d+.-]*:|\/|\.{1,2}\/)/;

const addRelativePrefix = (body: string) =>
  body.replace(MARKDOWN_IMAGE_TARGET, (match, prefix, target: string) =>
    NOT_ENTRY_RELATIVE.test(target) ? match : `${prefix}./${target}`,
  );

const stripRelativePrefix = (body: string) =>
  body.replace(MARKDOWN_IMAGE_TARGET, (match, prefix, target: string) =>
    target.startsWith("./") ? `${prefix}${target.slice(2)}` : match,
  );

const useDashBullets = (body: string) => {
  let fence: string | null = null;
  return body
    .split("\n")
    .map((line) => {
      const opener = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (opener) {
        const marker = opener[1];
        if (fence === null) fence = marker;
        else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
        return line;
      }
      return fence === null ? line.replace(/^(\s*)\* /, "$1- ") : line;
    })
    .join("\n");
};

const postBody = () => {
  const field = fields.mdx({
    label: "Body",
    options: {
      image: {
        directory: BLOG_DIRECTORY,
        transformFilename: sanitizeFilename,
      },
    },
  });

  return {
    ...field,
    parse: (value: never, args: { content?: Uint8Array }) =>
      field.parse(value, {
        ...args,
        content:
          args.content === undefined
            ? args.content
            : encoder.encode(stripRelativePrefix(decoder.decode(args.content))),
      } as never),
    serialize: (value: never, args: never) => {
      const output = field.serialize(value, args);
      if (output.content === undefined) return output;
      const body = useDashBullets(addRelativePrefix(decoder.decode(output.content)));

      return { ...output, content: encoder.encode(`\n${body}`) };
    },
  } as typeof field;
};

export default config({
  storage: { kind: "local" },
  ui: {
    brand: { name: "A Dilettante's Journal" },
  },
  collections: {
    blog: collection({
      label: "Blog posts",

      path: `${BLOG_DIRECTORY}/*/`,
      slugField: "title",
      format: { contentField: "content" },
      entryLayout: "content",
      columns: ["date", "category"],
      previewUrl: "/blog/{slug}",

      schema: {
        title: (() => {
          const field = fields.slug({
            name: { label: "Title", validation: { isRequired: true } },
            slug: {
              label: "Slug",
              description: "Folder name under src/content/blog/ and the post's URL.",
            },
          });
          return {
            ...field,
            serialize: (value: { name: string }) => ({ value: quoted(value.name) }),
            serializeWithSlug: (value: { name: string; slug: string }) => ({
              slug: value.slug,
              value: quoted(value.name),
            }),
          } as typeof field;
        })(),

        excerpt: text({
          label: "Excerpt",
          description: "Short summary used in listings, RSS and as the fallback meta description.",
          multiline: true,
          required: true,
        }),

        seoTitle: text({
          label: "SEO title",
          description: "Overrides the generated <title>. Optional.",
        }),

        seoDescription: text({
          label: "SEO description",
          description: "Overrides the excerpt as the meta description. Optional.",
          multiline: true,
        }),

        canonical: url({
          label: "Canonical URL",
          description: "Only set this when the post was first published elsewhere.",
        }),

        date: date({ label: "Published date", required: true }),

        updated: date({
          label: "Updated date",
          description: "Set this when a published post is meaningfully revised.",
        }),

        readingTime: positiveInteger({
          label: "Reading time (minutes)",
          description: "Leave empty to let the site estimate it from the body.",
        }),

        category: text({
          label: "Category",
          description:
            "Category slug, e.g. “engineering”. Matches an entry in src/config/theme.config.ts.",
          required: true,
        }),

        tags: fields.array(text({ label: "Tag", required: true }), {
          label: "Tags",
          description: "Tag slugs, lowercase.",
          itemLabel: (props) => props.value || "Tag",
        }),

        author: text({
          label: "Author",
          description: "Author slug, e.g. “romit”. Matches an entry in src/config/theme.config.ts.",
          required: true,
        }),

        thumbnail: entryImage({
          label: "Thumbnail",
          description: "Saved alongside index.mdx in this post's own folder.",
          required: true,
        }),

        thumbnailAlt: text({
          label: "Thumbnail alt text",
          description: "Describe the image for screen readers. Leave empty if purely decorative.",
        }),

        imageCredit: fields.object(
          {
            caption: creditPart({ label: "Caption" }),
            author: creditPart({ label: "Photographer" }),
            authorUrl: creditPart({ kind: "url", label: "Photographer URL" }),
            source: creditPart({ label: "Source", defaultValue: "Unsplash" }),
            sourceUrl: creditPart({ kind: "url", label: "Source URL" }),
          },
          {
            label: "Image credit",
            description:
              "Optional. Photographer, Photographer URL and Source URL are all required for a credit to be saved — until all three are filled in, no credit is written.",
            layout: [12, 6, 6, 6, 6],
          },
        ),

        featured: flag({
          label: "Featured",
          description: "Show this post in the featured slot on the home page.",
        }),

        draft: flag({
          label: "Draft",
          description: "Drafts are excluded from the built site.",
        }),

        content: postBody(),
      },
    }),
  },
});
