# web.elonn.local

`web.elonn.local` is the browser runtime for canonical World Datasets.

The runtime submits canonical Calls to `POST /world/call`, receives canonical
World Datasets, projects them into browser-owned render state, and renders
only the data published by World:

- objects
- relationships
- actions
- collections
- resources
- placements
- errors
- context

Web uses API only for runtime-owned authentication and World for runtime data.
Web does not call Social, Find, Maps, Messages, Time, provider endpoints, or
service loaders.

The next composition target is for Time, Messages, and Social to appear in Web
as World-published canonical content. Web should render that content generically
from the World Dataset instead of adding direct Service integrations.

## Authentication

`web.elonn.local` is independently launchable. When the browser runtime starts,
it validates the existing `elonn_api_token` auth session with API. If the token
is missing or invalid, Web renders its own `/login` screen. Successful login
posts credentials to API, stores the issued shared auth token cookie, and
continues into the runtime at `/`.

The account front door at `elonn.local` is not required to enter the web
runtime.

After member authentication, browser World Calls go directly to World with the
API-issued signed access token cookie. World validates that token locally; API
is not part of the normal runtime request path.

## Runtime projection

Web projects semantic Placement as a flat-screen runtime:

- Field Layer: persistent world anchored to reality.
- Workspace Layer: transient manifestation of the member's current intent.
- Carry Layer: member-following objects and controls.

The runtime renders collections as the primary interaction unit, objects as
selectable world primitives, resources as fetchable media or documents, and
actions as contextual World-dispatched affordances.

## Query input

Web exposes a query composer in the top runtime area. Typing text and pressing
Enter submits a canonical `world.compose` Call to World. The microphone control
uses browser speech recognition when available and fills the query field; text
submission still goes through the same World Call path.

Query submission asks the browser for coordinates during the submit gesture.
When coordinates are available, Web includes them as `content.origin` in the
canonical World Call. Nearby-shaped text such as "near me" requires
coordinates; other text continues without coordinates if the browser cannot
provide them. Web still calls only World; Mind and Maps decide the Service path
downstream.
