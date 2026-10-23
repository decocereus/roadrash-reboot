import { requireNulFileListRule } from "../rushline/rules/require-nul-file-list.ts";
import { runRule } from "./cases.ts";

const displayPaths = [{ messageId: "displayPaths" }];

runRule("rushline/require-nul-file-list", requireNulFileListRule, {
  invalid: [
    {
      code: 'execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf-8" }).split("\\n");',
      errors: displayPaths,
    },
    {
      code: 'git(root, ["ls-files", "-co", "--exclude-standard", "--", ...paths]);',
      errors: displayPaths,
    },
    {
      code: 'git(["ls-files", "--", ".references/effect"]);',
      errors: displayPaths,
    },
    { code: "run(['ls-files']);", errors: displayPaths },
    { code: "run([`ls-files`, '--cached']);", errors: displayPaths },
    { code: "run(['ls-files', ...flags]);", errors: displayPaths },
    { code: "run(['ls-files', '-xz']);", errors: displayPaths },
    { code: "run(['ls-files', '--', '-z']);", errors: displayPaths },
    { code: "run(['ls-files', '-x', '-z']);", errors: displayPaths },
    { code: "run(['ls-files', '-cX', '-z']);", errors: displayPaths },
    { code: "run(['ls-files', '--exclude', '-z']);", errors: displayPaths },
    {
      code: "run(['ls-files', '--exclude-from', '-z']);",
      errors: displayPaths,
    },
    {
      code: "run(['ls-files', '--exclude-per-directory', '-z']);",
      errors: displayPaths,
    },
    { code: "run(['ls-files', '--format', '-z']);", errors: displayPaths },
    { code: "run(['ls-files', '--with-tree', '-z']);", errors: displayPaths },
  ],
  valid: [
    'execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);',
    'git(root, ["ls-files", "-coz", "--exclude-standard", "--", ...paths]);',
    "run(['ls-files', '-zco']);",
    "run(['ls-files', '-z', '--', '-z']);",
    "run(['ls-files', '-x', '*.md', '-z']);",
    "run(['ls-files', '-x*.md', '-z']);",
    "run(['ls-files', '--exclude', pattern, '-z']);",
    "run(['ls-files', '--exclude=-z', '-z']);",
    "run(['ls-files', '--with-tree', 'HEAD', '-z']);",
    "run(['ls-files', '-s', '--abbrev', '-z']);",
    "run(['-C', root, 'ls-files', '--cached']);",
    "run([...LIST_FILES, '*.css']);",
    "run(['rev-parse', 'HEAD']);",
    "const words = ['ls-files'.length, 'ls-files '];",
  ],
});
