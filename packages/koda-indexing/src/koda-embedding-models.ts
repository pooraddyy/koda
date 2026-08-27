export type kodaEmbeddingModel = {
  id: string
  name: string
  dimension: number
  scoreThreshold: number
  note?: string
}

export type kodaEmbeddingModelCatalog = {
  defaultModel: string
  models: kodaEmbeddingModel[]
  aliases: Record<string, string>
}

export const EMPTY_koda_EMBEDDING_MODEL_CATALOG: kodaEmbeddingModelCatalog = {
  defaultModel: "",
  models: [],
  aliases: {},
}

export function normalizekodaEmbeddingModelId(model: string | undefined, catalog = EMPTY_koda_EMBEDDING_MODEL_CATALOG) {
  if (!model) return undefined
  return catalog.aliases[model] ?? model
}

export function getkodaEmbeddingModel(model: string | undefined, catalog = EMPTY_koda_EMBEDDING_MODEL_CATALOG) {
  const id = normalizekodaEmbeddingModelId(model, catalog)
  return catalog.models.find((item) => item.id === id)
}

export function formatkodaEmbeddingModelLabel(model: kodaEmbeddingModel): string {
  const note = model.note ? `${model.note}, ` : ""
  return `${model.name} (${note}${model.dimension}d)`
}
