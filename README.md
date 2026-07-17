# web.elonn.local

`web.elonn.local` is the browser runtime for canonical World Datasets.

The runtime submits canonical Calls to `POST /world/call`, receives canonical
World Datasets, adapts them into browser scene sections, and renders only the
data published by World:

- identity
- context
- objects
- relationships
- actions
- collections
- layout
- capabilities
- permissions
- resources
- extensions
- metadata

World is the only dependency. Web does not call Social, Find, Maps, Messages,
Time, provider endpoints, or service loaders.

## Runtime projection

Web renders the World layout layers as a flat-screen runtime:

- Carry Layer: persistent user-anchored workspace with top, side, main, and
  bottom zones.
- Findings Layer: user-anchored discovery collections.
- Field Layer: world-anchored surroundings projected for a browser.

The runtime renders collections as the primary interaction unit, objects as
selectable world primitives, resources as fetchable media or documents, and
actions as contextual World-dispatched affordances.

The previous compatibility runtime was moved to `../web.elonn.local.legacy-runtime`
as migration evidence.
