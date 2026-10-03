import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { builtinModules } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directories = [
  "shared",
  "server",
  ...readdirSync(join(root, "apps")).map((name) => `apps/${name}`),
];
const packages = directories
  .filter((directory) => existsSync(join(root, directory, "package.json")))
  .map((directory) => {
    const manifest = JSON.parse(readFileSync(join(root, directory, "package.json"), "utf8"));
    return {
      directory: resolve(root, directory),
      name: manifest.name,
      exports: manifest.exports ?? {},
    };
  });

function owner(filename) {
  return packages.find((pkg) => filename.startsWith(pkg.directory + sep));
}

function sourceModule(filename, pkg) {
  if (!pkg || !filename.startsWith(join(pkg.directory, "src") + sep)) return null;
  let directory = dirname(filename);
  const sourceRoot = join(pkg.directory, "src");
  while (directory !== sourceRoot) {
    if (
      existsSync(join(directory, "index.ts")) ||
      existsSync(join(directory, "index.tsx")) ||
      existsSync(join(directory, "index.css"))
    )
      return directory;
    directory = dirname(directory);
  }
  return null;
}

function resolveFile(filename) {
  const candidates = [
    filename,
    filename.replace(/\.js$/, ".ts"),
    filename.replace(/\.js$/, ".tsx"),
    ...[".ts", ".tsx", ".mjs", ".css"].map((extension) => filename + extension),
    join(filename, "index.ts"),
    join(filename, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && extname(candidate)) return realpathSync(candidate);
  }
  return filename;
}

function exportTarget(value) {
  if (typeof value === "string") return value;
  return value?.default ?? value?.import ?? value?.types;
}

export function checkImport(filename, specifier) {
  filename = resolve(filename);
  const sourcePackage = owner(filename);
  const source = sourceModule(filename, sourcePackage);
  const sourcePath = source ? relative(sourcePackage.directory, source).split(sep) : [];
  const browser =
    sourcePath[1] === "client" ||
    sourcePath[1] === "contracts" ||
    sourcePath[1] === "domain" ||
    sourcePath[1] === "storage";
  if (
    browser &&
    (/^node:/.test(specifier) ||
      builtinModules.includes(specifier) ||
      /^(pg|better-sqlite3|drizzle-orm|hono|@hono\/node-server)(\/|$)/.test(specifier))
  )
    return "Browser-safe modules cannot import server libraries.";
  let target;
  let namedPackage;
  for (const pkg of packages) {
    if (specifier === pkg.name || specifier.startsWith(pkg.name + "/")) {
      namedPackage = pkg;
      const key = specifier === pkg.name ? "." : "." + specifier.slice(pkg.name.length);
      const exported = exportTarget(pkg.exports[key]);
      if (!exported)
        return `Use an explicit public export of ${pkg.name}; internal subpaths are forbidden.`;
      target = resolveFile(resolve(pkg.directory, exported));
      break;
    }
  }
  if (!target) {
    if (specifier.startsWith(".") || isAbsolute(specifier))
      target = resolveFile(resolve(dirname(filename), specifier));
    else if (specifier.startsWith("#") || specifier.startsWith("@repo/"))
      return "Unregistered aliases cannot bypass module boundaries.";
    else return null;
  }
  const targetPackage = owner(target);
  if (!targetPackage) {
    if (browser)
      return "Browser-safe modules cannot import repository tooling or unclassified files.";
    return null;
  }
  if (sourcePackage && targetPackage !== sourcePackage && !namedPackage)
    return "Cross-package relative imports are forbidden; use public package exports.";
  if (
    sourcePackage?.directory.includes(`${sep}apps${sep}`) &&
    targetPackage.directory.includes(`${sep}apps${sep}`) &&
    sourcePackage !== targetPackage
  )
    return "Apps cannot depend on other apps.";
  const destination = sourceModule(target, targetPackage);
  const destinationPath = destination
    ? relative(targetPackage.directory, destination).split(sep)
    : [];
  if (
    browser &&
    !["client", "contracts", "domain", "storage", "styles"].includes(destinationPath[1])
  )
    return "Browser-safe modules cannot import server or unclassified modules.";
  if (
    source &&
    destination &&
    source !== destination &&
    !/^index\.(ts|tsx|css)$/.test(target.slice(destination.length + 1))
  )
    return "Cross-module imports must use the destination index API.";
  return null;
}

export default {
  meta: { name: "repo" },
  rules: {
    boundaries: {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          forbidden: "{{reason}}",
          dynamic: "Module paths must be literals so boundaries can be checked.",
        },
      },
      create(context) {
        const filename = context.filename ?? context.getFilename();
        function inspect(node, source) {
          if (!source) return;
          const specifier =
            source.value ??
            (source.type === "TemplateLiteral" && source.expressions.length === 0
              ? source.quasis[0].value.cooked
              : undefined);
          if (typeof specifier !== "string") {
            if (owner(resolve(filename))) context.report({ node, messageId: "dynamic" });
            return;
          }
          const reason = checkImport(filename, specifier);
          if (reason) context.report({ node, messageId: "forbidden", data: { reason } });
        }
        return {
          ImportDeclaration: (node) => inspect(node, node.source),
          ExportNamedDeclaration: (node) => inspect(node, node.source),
          ExportAllDeclaration: (node) => inspect(node, node.source),
          ImportExpression: (node) => inspect(node, node.source),
          TSImportType: (node) =>
            inspect(
              node,
              node.source ??
                node.parameter?.literal ??
                node.argument?.literal ??
                node.parameter ??
                node.argument,
            ),
          CallExpression(node) {
            if (node.callee.type === "Identifier" && node.callee.name === "require")
              inspect(node, node.arguments[0]);
          },
        };
      },
    },
  },
};
