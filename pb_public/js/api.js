// Data backends. Both expose the same four async methods:
//   list(collection) -> records[]   create(collection, body) -> record
//   update(collection, id, body) -> record   remove(collection, id)

/** Talks to PocketBase's REST API. baseUrl "" means the same server that served the page. */
export function createPocketBaseApi(baseUrl = "") {
  async function check(res) {
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res;
  }
  const json = body => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  return {
    async list(collection) {
      const url = `${baseUrl}/api/collections/${collection}/records?perPage=500`;
      const first = await (await check(await fetch(url))).json();
      let items = first.items || [];
      for (let p = 2; p <= (first.totalPages || 1); p++) {
        const page = await (await check(await fetch(`${url}&page=${p}`))).json();
        items = items.concat(page.items || []);
      }
      return items;
    },
    async create(collection, body) {
      const res = await fetch(`${baseUrl}/api/collections/${collection}/records`, { method: "POST", ...json(body) });
      return (await check(res)).json();
    },
    async update(collection, id, body) {
      const res = await fetch(`${baseUrl}/api/collections/${collection}/records/${id}`, { method: "PATCH", ...json(body) });
      return (await check(res)).json();
    },
    async remove(collection, id) {
      await check(await fetch(`${baseUrl}/api/collections/${collection}/records/${id}`, { method: "DELETE" }));
    }
  };
}

/**
 * Keeps everything in memory — used by demo mode. Nothing is saved; a page reload resets it.
 * `seed` maps collection name -> array of records (ids are assigned if missing).
 */
export function createMemoryApi(seed = {}) {
  let nextId = 1;
  const newId = () => `mem${String(nextId++).padStart(12, "0")}`;
  const store = {};
  for (const [collection, records] of Object.entries(seed)) {
    store[collection] = records.map(r => ({ id: r.id || newId(), ...r }));
  }
  const table = c => (store[c] ||= []);
  const copy = r => JSON.parse(JSON.stringify(r));
  const find = (c, id) => {
    const rec = table(c).find(r => r.id === id);
    if (!rec) throw new Error(`404 ${c}/${id} not found`);
    return rec;
  };

  return {
    async list(collection) { return table(collection).map(copy); },
    async create(collection, body) {
      const rec = { ...copy(body), id: newId() };
      table(collection).push(rec);
      return copy(rec);
    },
    async update(collection, id, body) {
      const rec = find(collection, id);
      Object.assign(rec, copy(body));
      return copy(rec);
    },
    async remove(collection, id) {
      find(collection, id);
      store[collection] = table(collection).filter(r => r.id !== id);
    }
  };
}
