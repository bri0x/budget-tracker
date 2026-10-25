/// <reference path="../pb_data/types.d.ts" />
// Seeds a starter set of categories so a fresh install is usable right away.
// Only runs on an empty category_data collection — existing setups are left untouched.
// Rename or delete any of these in the app under "Manage Categories".
const STARTER_CATEGORIES = {
  "Housing":       ["Rent/Mortgage", "Maintenance", "Supplies"],
  "Bills":         ["Electricity", "Water", "Internet", "Phone", "Insurance"],
  "Food":          ["Groceries", "Dining Out", "Coffee"],
  "Transport":     ["Gas", "Public Transit", "Parking", "Car Maintenance"],
  "Health":        ["Doctor", "Pharmacy", "Fitness"],
  "Entertainment": ["Streaming", "Events", "Hobbies"],
  "Other":         ["Gifts", "Clothing", "Miscellaneous"]
};

migrate((app) => {
  if (app.countRecords("category_data") > 0) return;

  const collection = app.findCollectionByNameOrId("category_data");
  for (const [name, subcategories] of Object.entries(STARTER_CATEGORIES)) {
    const record = new Record(collection);
    record.set("name", name);
    record.set("subcategories", subcategories);
    app.save(record);
  }
}, (app) => {
  // Down: intentionally a no-op. Once seeded, categories belong to the user
  // and may have transactions attached, so reverting never deletes them.
});
