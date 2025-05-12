import type { PluginOption } from "vite";

type FS = {
  readFile: (path: string) => Thenable<string | null>;
  writeFile: (path: string, data: string) => Thenable<void>;
  rm: (path: string) => Thenable<void>;
};
const defaultFs = {
  async readFile(path) {
    const { readFile } = await import("node:fs/promises");
    return readFile(path, "utf8").catch(() => null);
  },
  async writeFile(path, data) {
    const { writeFile } = await import("node:fs/promises");
    return writeFile(path, data, "utf8");
  },
  async rm(path) {
    const { rm } = await import("node:fs/promises");
    return rm(path, { force: true });
  },
} satisfies FS;

type ResolvePath = (...paths: string[]) => Thenable<string>;
const defaultResolvePath: ResolvePath = async (...paths: string[]) => {
  const { resolve } = await import("node:path");
  return resolve(...paths);
};

type Thenable<T> = T | Promise<T>;
type Arrayable<T> = T | T[];

export type Options = {
  name?: string;
  extension: Arrayable<`.${string}`>;
  transform: (code: string, id: string) => Thenable<string>;
  generatedSuffix?: `.${string}`;
  fs?: FS;
  resolvePath?: ResolvePath;
};

export function unknown(...options: Arrayable<Options>[]): PluginOption[] {
  return options.flat().map(instantiate);
}

function instantiate(option: Options): PluginOption {
  const suffix = option.generatedSuffix ?? ".d.ts";
  const fs = option.fs ?? defaultFs;
  const resolvePath = option.resolvePath ?? defaultResolvePath;
  const extension = Array.isArray(option.extension)
    ? option.extension
    : [option.extension];

  return {
    name: option.name ?? `unknown-plugin(${extension.join(",")})`,
    enforce: "pre",
    resolveId: {
      filter: {
        id: extensionFilter(extension),
      },
      async handler(source, importer) {
        // Double-checking for the possibility that the filter property is not supported.
        if (extension.every((ext) => !source.endsWith(ext))) {
          return null;
        }
        const resolved = importer
          ? await resolvePath(importer, "..", source)
          : source;

        const code = await fs.readFile(resolved);
        if (code === null) {
          return null;
        }

        this.addWatchFile(resolved);
        const path = `${resolved}${suffix}`;

        const generated = await option.transform(code, resolved);
        await fs.writeFile(path, generated);
        return path;
      },
    },
    watchChange: {
      async handler(id, change) {
        if (extension.every((ext) => !id.endsWith(ext))) {
          return;
        }
        const path = `${id}${suffix}`;
        switch (change.event) {
          case "create":
            // noop
            break;
          case "update":
            const code = await fs.readFile(id);
            if (code === null) {
              return;
            }

            const generated = await option.transform(code, id);
            await fs.writeFile(path, generated);
            break;
          case "delete":
            await fs.rm(path);
            break;
        }
      },
    },
  };
}

function extensionFilter(extension: `.${string}`[]): RegExp | RegExp[] {
  return extension.map((ext) => new RegExp(`\\${ext}$`));
}
