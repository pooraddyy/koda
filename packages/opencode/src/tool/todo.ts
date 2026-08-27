import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import DESCRIPTION_WRITE from "./todowrite.txt"
import { Todo } from "../session/todo"
// koda_change start
import { TodoView } from "../koda/todo-view"
// koda_change end

export const Parameters = Schema.Struct({
  todos: Schema.mutable(Schema.Array(Todo.Info)).annotate({ description: "The updated todo list" }),
})

type Metadata = {
  todos: Todo.Info[]
  // koda_change start
  view?: TodoView.Info
  // koda_change end
}

export const TodoWriteTool = Tool.define<typeof Parameters, Metadata, Todo.Service>(
  "todowrite",
  Effect.gen(function* () {
    const todo = yield* Todo.Service

    return {
      description: DESCRIPTION_WRITE,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "todowrite",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })

          // koda_change start
          const before = yield* todo.get(ctx.sessionID)
          const view = TodoView.calculate(before, params.todos)
          // koda_change end

          yield* todo.update({
            sessionID: ctx.sessionID,
            todos: params.todos,
          })

          return {
            title: `${params.todos.filter((x) => x.status !== "completed").length} todos`,
            output: JSON.stringify(params.todos, null, 2),
            metadata: {
              todos: params.todos,
              // koda_change start
              view,
              // koda_change end
            },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
