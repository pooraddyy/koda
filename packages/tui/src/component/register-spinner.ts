import { getComponentCatalogue } from "@opentui/solid/components"
import { registerSpinner } from "opentui-spinner/solid"

export function registerKodaSpinner() {
  if (!getComponentCatalogue().spinner) registerSpinner()
}
