/**
 * The AI-tasks module's barrel: the group layer, and the {@link TaskProvider}
 * service — which is on it because the *other* checked write door lives in the
 * secrets group, and a door that has to be reached by a deep import is a door
 * someone will walk around.
 *
 * The pure kernel and the settings store are deliberately not here. They are the
 * inside of this module: the kernel is reached by its own test, and `writeAll`
 * has exactly one caller, the door.
 */
export { AiTasksLive } from "./handlers";
export { TaskProvider } from "./task-provider";
