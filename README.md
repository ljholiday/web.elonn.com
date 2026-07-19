# web.elonn.local

`web.elonn.local` is the browser runtime for canonical World Datasets.

The runtime submits canonical Calls to `POST /world/call`, receives canonical
World Datasets, translates them into browser-owned render state, and renders
only the data published by World:

- objects
- relationships
- actions
- collections
- resources
- placements
- errors
- context

World is the only dependency. Web does not call Social, Find, Maps, Messages,
Time, provider endpoints, or service loaders.

## Runtime projection

Web translates semantic Placement as a flat-screen runtime:

- Field Layer: persistent world anchored to reality.
- Workspace Layer: transient manifestation of the member's current intent.
- Carry Layer: member-following objects and controls.

The runtime renders collections as the primary interaction unit, objects as
selectable world primitives, resources as fetchable media or documents, and
actions as contextual World-dispatched affordances.

The previous compatibility runtime was moved to `../web.elonn.local.legacy-runtime`
as migration evidence.
