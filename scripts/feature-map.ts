import path from "node:path";

type FeatureKind = "feature" | "platform";
type DocLink = `${string}.md#${string}`;
type Recipe = `${string}.md`;

export interface FeatureEntry {
  readonly docs: readonly DocLink[];
  readonly id: string;
  readonly kind: FeatureKind;
  readonly owns: readonly [string, ...string[]];
  readonly perf: readonly string[];
  readonly start:
    | readonly [string]
    | readonly [string, string]
    | readonly [string, string, string];
  readonly summary: string;
  readonly title: string;
  readonly verify: readonly Recipe[];
}

export interface Repository {
  readonly budgets: ReadonlySet<string>;
  readonly docs: ReadonlyMap<string, string>;
  readonly files: readonly string[];
  readonly map: string | null;
  readonly recipes: ReadonlySet<string>;
}

const MANIFEST = "scripts/features.ts";
const ENTRY_LISTS = "scripts/*features.ts";
export const MAP = "docs/feature-map.md";
export const RECIPES = ".claude/skills/verify-rushline/features";
export const BUDGETS = "tools/perf/budgets.json";

const sourceRoots = ["apps/", "packages/", "tools/", "scripts/"];
const sourceFile = /\.(?:css|sql|ts|tsx)$/u;
const testFile = /(?:^|\/)test\/|\.test\.tsx?$/u;
const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const atxHeading = /^ {0,3}#{1,6}(?:[ \t]+(?<text>.*?))?(?:[ \t]+#+)?[ \t]*$/u;
const fenceMarks = /^ {0,3}(?<marks>`{3,}|~{3,})/u;
const inlineLink = /!?\[(?<text>[^\]]*)\]\([^)]*\)/gu;
const notSlugged = /[^\p{L}\p{M}\p{N}\p{Pc} -]/gu;

const kinds = [
  { heading: "Features", kind: "feature" },
  { heading: "Platform", kind: "platform" },
] as const;

export const LIST_FILES = [
  "ls-files",
  "-z",
  "--cached",
  "--others",
  "--exclude-standard",
];

export const sourceFilesOf = (
  listed: string,
  exists: (file: string) => boolean
): string[] =>
  (listed.endsWith("\0") ? listed.slice(0, -1) : listed)
    .split("\0")
    .filter(
      (file) =>
        sourceRoots.some((root) => file.startsWith(root)) &&
        sourceFile.test(file) &&
        exists(file)
    )
    .toSorted();

const matches = (pattern: string, file: string) =>
  path.matchesGlob(file, pattern);

const ownedFiles = (entry: FeatureEntry, files: readonly string[]) =>
  files.filter((file) => entry.owns.some((pattern) => matches(pattern, file)));

const slugger = () => {
  const seen = new Map<string, number>();
  return (heading: string): string => {
    const base = heading
      .replaceAll(inlineLink, "$<text>")
      .toLowerCase()
      .replaceAll(notSlugged, "")
      .replaceAll(" ", "-");
    let slug = base;
    while (seen.has(slug)) {
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      slug = `${base}-${count}`;
    }
    seen.set(slug, 0);
    return slug;
  };
};

const withoutFrontMatter = (lines: readonly string[]) => {
  const end = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  return end === -1 ? lines : lines.slice(end + 1);
};

export const anchorsOf = (markdown: string): ReadonlySet<string> => {
  const slug = slugger();
  const anchors = new Set<string>();
  let fence = "";
  for (const line of withoutFrontMatter(markdown.split("\n"))) {
    const marks = fenceMarks.exec(line)?.groups?.marks ?? "";
    if (fence !== "") {
      if (marks.startsWith(fence[0] ?? "") && marks.length >= fence.length) {
        fence = "";
      }
      continue;
    }
    if (marks !== "") {
      fence = marks;
      continue;
    }
    const heading = atxHeading.exec(line);
    if (heading) {
      anchors.add(slug(heading.groups?.text ?? ""));
    }
  }
  return anchors;
};

const splitLink = (link: DocLink) => {
  const at = link.indexOf("#");
  return { anchor: link.slice(at + 1), file: link.slice(0, at) };
};

export const docFilesOf = (entries: readonly FeatureEntry[]): string[] => [
  ...new Set(
    entries.flatMap((entry) => entry.docs.map((link) => splitLink(link).file))
  ),
];

const idProblems = (entries: readonly FeatureEntry[]) => {
  const counts = new Map<string, number>();
  for (const { id } of entries) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [
    ...[...counts]
      .filter(([, count]) => count > 1)
      .map(
        ([id]) =>
          `${ENTRY_LISTS}: ${counts.get(id)} entries have the id "${id}"; give each entry its own id.`
      ),
    ...[...counts.keys()]
      .filter((id) => !kebabCase.test(id))
      .map(
        (id) =>
          `${ENTRY_LISTS}: the id "${id}" is not kebab-case; use lower-case words joined by hyphens.`
      ),
  ];
};

const ownershipProblems = (
  entries: readonly FeatureEntry[],
  files: readonly string[]
) =>
  files.flatMap((file) => {
    const owners = entries
      .filter((entry) => entry.owns.some((pattern) => matches(pattern, file)))
      .map((entry) => entry.id);
    if (owners.length === 0) {
      return [
        `${file}: no entry in ${ENTRY_LISTS} owns this file; add it to the owns list of the entry whose behaviour it implements, then run \`pnpm feature-map\`.`,
      ];
    }
    if (owners.length > 1) {
      return [
        `${file}: owned by ${owners.join(", ")}; narrow their owns patterns in ${ENTRY_LISTS} so exactly one entry matches it.`,
      ];
    }
    return [];
  });

const docProblems = (entry: FeatureEntry, repo: Repository) =>
  entry.docs.flatMap((link) => {
    const { anchor, file } = splitLink(link);
    const text = repo.docs.get(file);
    if (text === undefined) {
      return [
        `${entry.id}: the docs link "${link}" names a file that does not exist; link a section of an existing doc.`,
      ];
    }
    if (!anchorsOf(text).has(anchor)) {
      return [
        `${entry.id}: the docs link "${link}" names no heading in ${file}; use the anchor GitHub gives one of its headings (lower case, punctuation dropped, spaces as hyphens).`,
      ];
    }
    return [];
  });

const entryProblems = (entry: FeatureEntry, repo: Repository) => {
  const owned = new Set(ownedFiles(entry, repo.files));
  return [
    ...entry.owns
      .filter((pattern) => !repo.files.some((file) => matches(pattern, file)))
      .map(
        (pattern) =>
          `${entry.id}: the owns pattern "${pattern}" matches no source file; fix the pattern or remove it.`
      ),
    ...entry.start
      .filter((file) => !owned.has(file))
      .map(
        (file) =>
          `${entry.id}: the start file "${file}" is not a file ${entry.id} owns; start lists one to three files of the entry's own.`
      ),
    ...docProblems(entry, repo),
    ...entry.verify
      .filter((recipe) => !repo.recipes.has(recipe))
      .map(
        (recipe) =>
          `${entry.id}: the verify recipe "${recipe}" is not a file in ${RECIPES}; name an existing feature file or leave verify empty.`
      ),
    ...entry.perf
      .filter((id) => !repo.budgets.has(id))
      .map(
        (id) =>
          `${entry.id}: the perf id "${id}" is not a metric in ${BUDGETS}; use a metric its limits name or leave perf empty.`
      ),
  ];
};

const code = (text: string) => `\`${text}\``;

const fromMap = (target: string) =>
  path.posix.relative(path.posix.dirname(MAP), target);

const docLink = (link: DocLink) => {
  const { anchor, file } = splitLink(link);
  return `[${link}](${fromMap(file)}#${anchor})`;
};

const recipeLink = (recipe: Recipe) =>
  `[${recipe}](${fromMap(`${RECIPES}/${recipe}`)})`;

const listed = (items: readonly string[]) =>
  items.length > 0 ? items.join(", ") : "none yet";

const fileList = (label: string, files: readonly string[]) =>
  files.length > 0
    ? [`${label}:`, files.map((file) => `- ${code(file)}`).join("\n")]
    : [`${label}: none`];

const section = (
  entry: FeatureEntry,
  files: readonly string[]
): readonly string[] => {
  const owned = ownedFiles(entry, files);
  return [
    `### ${entry.title}`,
    entry.summary,
    [
      `- Id: ${code(entry.id)}`,
      `- Start: ${entry.start.map(code).join(", ")}`,
      `- Docs: ${listed(entry.docs.map(docLink))}`,
      `- Verify: ${listed(entry.verify.map(recipeLink))}`,
      `- Perf: ${listed(entry.perf.map(code))}`,
      `- Owns: ${entry.owns.map(code).join(", ")}`,
    ].join("\n"),
    ...fileList(
      "Source files",
      owned.filter((file) => !testFile.test(file))
    ),
    ...fileList(
      "Test files",
      owned.filter((file) => testFile.test(file))
    ),
  ];
};

export const renderFeatureMap = (
  entries: readonly FeatureEntry[],
  files: readonly string[]
): string => {
  const slug = slugger();
  for (const heading of ["Feature map", "Index"]) {
    slug(heading);
  }
  for (const group of kinds) {
    slug(group.heading);
  }
  const groups = kinds.map((group) => {
    slug(group.heading);
    const members = entries
      .filter((entry) => entry.kind === group.kind)
      .map((entry) => ({ anchor: slug(entry.title), entry }));
    return { ...group, members };
  });
  const blocks = [
    `Generated from ${code(MANIFEST)} by ${code("pnpm feature-map")}. Do not edit this file by hand.`,
    "# Feature map",
    `Every TS, TSX, CSS and SQL file under ${code("apps/")}, ${code("packages/")}, ${code("tools/")} and ${code("scripts/")} belongs to exactly one entry below. Find the entry for the behaviour you are changing, read its start files and docs, and prove the change with its verify recipes and perf budgets. Test files are named ${code("*.test.ts")} or sit in a ${code("test/")} folder. ${code("pnpm check:feature-map")} fails when a file has no owner or two, or when this file is out of date.`,
    "## Index",
    ...groups.flatMap((group) => [
      `### ${group.heading}`,
      group.members.length > 0
        ? group.members
            .map(
              ({ anchor, entry }) =>
                `- [${entry.title}](#${anchor}): ${code(entry.id)}`
            )
            .join("\n")
        : "None yet.",
    ]),
    ...groups.flatMap((group) => [
      `## ${group.heading}`,
      ...group.members.flatMap(({ entry }) => section(entry, files)),
    ]),
  ];
  return `${blocks.join("\n\n")}\n`;
};

export const featureMapProblems = (
  entries: readonly FeatureEntry[],
  repo: Repository
): string[] => {
  const problems = [
    ...idProblems(entries),
    ...ownershipProblems(entries, repo.files),
    ...entries.flatMap((entry) => entryProblems(entry, repo)),
  ];
  if (repo.map === null) {
    problems.push(`${MAP} does not exist; run \`pnpm feature-map\`.`);
  } else if (repo.map !== renderFeatureMap(entries, repo.files)) {
    problems.push(
      `${MAP} is out of date with ${MANIFEST}; run \`pnpm feature-map\`.`
    );
  }
  return problems;
};
