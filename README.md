# web.elonn.local

`web.elonn.local` is the browser runtime for the canonical World Dataset Contract.

The runtime requests `elonn.world.dataset` version 1 from World and renders only
the dataset sections published by World:

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
Time, provider endpoints, or service loaders. Interactive commands are dispatched
only through World action endpoints published in the dataset.

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
