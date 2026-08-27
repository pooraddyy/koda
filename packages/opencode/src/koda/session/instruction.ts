import { kodaMarkdown } from "../config/markdown"

export namespace kodaInstruction {
  export function content(text: string, item: string, options: kodaMarkdown.Options) {
    return kodaMarkdown.substitute(text, item, options)
  }

  export async function read(item: string, options: kodaMarkdown.Options) {
    return content(await kodaMarkdown.read(item, options), item, options)
  }
}
