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
  ],
  valid: [
    'execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);',
    'git(root, ["ls-files", "-coz", "--exclude-standard", "--", ...paths]);',
    "run(['ls-files', '-zco']);",
    "run(['-C', root, 'ls-files', '--cached']);",
    "run([...LIST_FILES, '*.css']);",
    "run(['rev-parse', 'HEAD']);",
    "const words = ['ls-files'.length, 'ls-files '];",
  ],
});
