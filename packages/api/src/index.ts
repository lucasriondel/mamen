import { BunRuntime } from "@effect/platform-bun";
import { Layer } from "effect";
import { ServerLive } from "./server";

BunRuntime.runMain(Layer.launch(ServerLive));
