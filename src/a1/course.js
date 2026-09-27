import { dailyScenes } from "./daily.js";
import { examScenes } from "./exam.js";
import { grammarScenes } from "./grammar.js";
import { peopleScenes } from "./people.js";
import { townScenes } from "./town.js";

/** The active course: official A1, including Start Deutsch 1 tasks. */
export const a1Scenes = [...peopleScenes, ...dailyScenes, ...townScenes, ...grammarScenes, ...examScenes];
