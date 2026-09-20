import assert from "node:assert/strict";

import { deviceDisplayName } from "./device-display-name";

assert.equal(
  deviceDisplayName("fs_FamilyScreen Ottola", "Ottola"),
  "Ottola",
  "the existing Ottola device must keep its historical UI label",
);
assert.equal(
  deviceDisplayName("hagenberg-1", "Ottola"),
  "hagenberg-1",
  "a separately named device must not be displayed as its owner",
);

console.log("device display name check ok");
