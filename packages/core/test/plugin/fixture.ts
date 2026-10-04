import { AgentV2 } from "@koda-ai/core/agent"
import { AISDK } from "@koda-ai/core/aisdk"
import { Catalog } from "@koda-ai/core/catalog"
import { CommandV2 } from "@koda-ai/core/command"
import { Credential } from "@koda-ai/core/credential"
import { AppNodeBuilder } from "@koda-ai/core/effect/app-node-builder"
import { LayerNodePlatform } from "@koda-ai/core/effect/app-node-platform"
import { LayerNode } from "@koda-ai/core/effect/layer-node"
import { EventV2 } from "@koda-ai/core/event"
import { FileSystem } from "@koda-ai/core/filesystem"
import { FSUtil } from "@koda-ai/core/fs-util"
import { Integration } from "@koda-ai/core/integration"
import { Location } from "@koda-ai/core/location"
import { Npm } from "@koda-ai/core/npm"
import { PluginV2 } from "@koda-ai/core/plugin"
import { Reference } from "@koda-ai/core/reference"
import { SkillV2 } from "@koda-ai/core/skill"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: () => Effect.succeed({ directory: "", entrypoint: undefined }),
    install: () => Effect.void,
    which: () => Effect.succeed(undefined),
  }),
)

export const PluginTestLayer = AppNodeBuilder.build(
  LayerNode.group([
    FileSystem.node,
    FSUtil.node,
    Location.node,
    Npm.node,
    Credential.node,
    EventV2.node,
    LayerNodePlatform.httpClient,
    PluginV2.node,
    AgentV2.node,
    AISDK.node,
    Catalog.node,
    CommandV2.node,
    Integration.node,
    Reference.node,
    SkillV2.node,
  ]),
  [
    [Location.node, tempLocationLayer],
    [Npm.node, npmLayer],
  ],
)
