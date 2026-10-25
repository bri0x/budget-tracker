// Copy this file to config.js (same folder) and edit it.
// config.js is gitignored, so your household's names stay out of the repo.
// If config.js is missing, the app falls back to two generic users.
window.BUDGET_CONFIG = {
  // The starting list of people. The first time the app loads, they're copied into the
  // database; after that, add/rename/remove people in the app under "Manage Users"
  // and this list is ignored.
  //   id    - stored on every record in PocketBase
  //   label - display name in the user dropdown and "All" view badges
  //   color - badge color in the "All" view
  users: [
    { id: "user1", label: "User 1", color: "#36a2eb" },
    { id: "user2", label: "User 2", color: "#e44d7b" }
  ],

  // PocketBase base URL. Leave empty to use the same server that serves this page
  // (the normal setup). Only set it if you host the HTML somewhere else.
  pbUrl: ""
};
