import * as path from "path"
import os from "os"
import { Filesystem } from "../util/filesystem"

export namespace kodaPaths {
  const home = () => process.env.HOME || process.env.USERPROFILE || os.homedir()

  /** Global Koda configuration directory in the user's home folder. */
  export function globalDirs(): string[] {
    return [path.join(home(), ".koda")]
  }

  /**
   * Discover koda directories containing skills.
   * Returns parent directories for the glob pattern "skills/**\/SKILL.md".
   *
   * - Walks up from projectDir to worktreeRoot for `.koda/`
   * - Includes global `~/.koda/`
   *
   * Discovery never copies or migrates skill content.
   */
  export async function skillDirectories(opts: {
    projectDir: string
    worktreeRoot: string
    skipGlobalPaths?: boolean
  }): Promise<string[]> {
    const directories: string[] = []

    if (!opts.skipGlobalPaths) {
      // Global skills load first so project-level definitions can override them.
      for (const global of globalDirs()) {
        const globalSkills = path.join(global, "skills")
        if (!(await Filesystem.isDir(globalSkills))) continue
        directories.push(global) // Return parent, not skills/
      }
    }

    // Project-level skills load last so their definitions take precedence.
    for (const target of [".koda"] as const) {
      const projectDirs = await Array.fromAsync(
        Filesystem.up({
          targets: [target],
          start: opts.projectDir,
          stop: opts.worktreeRoot,
        }),
      )
      for (const dir of projectDirs) {
        const skillsDir = path.join(dir, "skills")
        if ((await Filesystem.isDir(skillsDir)) && !directories.includes(dir)) {
          directories.push(dir)
        }
      }
    }

    return directories
  }
}
