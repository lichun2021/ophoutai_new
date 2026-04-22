# Design System Strategy: The Curated Companion

## 1. Overview & Creative North Star
This design system moves away from the sterile, "template-first" approach of typical pet applications. Our Creative North Star is **"The Organic Concierge"**—a philosophy that blends the high-end editorial feel of a premium lifestyle magazine with the warmth and approachability of a trusted local vet. 

To achieve this, we break the "standard" digital grid. We utilize **intentional asymmetry**, where pet imagery often breaks container boundaries, and **tonal depth**, where hierarchy is defined by soft color shifts rather than rigid lines. The result is a signature experience that feels premium, fluid, and deeply human (and animal) centric.

## 2. Color & Tonal Architecture
Our palette uses a sophisticated "Warm-Cool" tension. The playful energy of our primary oranges is balanced by the calming, trustworthy depth of our teal secondaries.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to section content. Boundaries must be defined solely through background color shifts or subtle tonal transitions. For example, a `surface-container-low` section sitting on a `surface` background provides all the separation a user needs without the visual clutter of a "box."

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—like stacked sheets of fine, heavy-stock paper.
*   **Base:** `surface` (#fff4f3) — The canvas.
*   **Sections:** `surface-container-low` (#ffedeb) — Used for large structural groupings.
*   **Cards/Elements:** `surface-container-highest` (#ffd2cf) — Used for the most interactive, "top-level" floating items.

### The "Glass & Gradient" Rule
To elevate the "playful" prompt into "premium," use **Glassmorphism** for floating navigation bars or contextual overlays.
*   **Implementation:** Use `surface` at 70% opacity with a 24px backdrop-blur. 
*   **Signature Textures:** Apply a subtle linear gradient (from `primary` to `primary-container`) on hero CTAs. This creates a "glow" that flat colors cannot replicate, giving the pet-centric interface a modern, soul-filled polish.

## 3. Typography: Editorial Authority
We utilize **Plus Jakarta Sans** to provide a contemporary, geometric feel that remains highly legible.

*   **Display (lg/md/sm):** These are your "Hero" moments. Use these for high-impact headlines. Set them with tight letter-spacing (-0.02em) to create an authoritative, editorial look.
*   **Headline & Title:** Use these to guide the user through the "story" of the page. 
*   **Body (lg/md/sm):** Reserved for pet bios, medical details, and descriptions. The generous x-height of Plus Jakarta Sans ensures readability even at the smallest `body-sm` (0.75rem) size.
*   **Labels:** Use for metadata (e.g., "Breed," "Age"). These should always be in `label-md` or `label-sm` to maintain a clear distinction from actionable text.

## 4. Elevation & Depth: The Layering Principle
We reject the heavy, "drop-shadow-everything" aesthetic of the early 2010s. Depth is achieved through **Tonal Layering**.

*   **Natural Lift:** Place a `surface-container-lowest` card on a `surface-container-low` section. This creates a soft, natural lift that feels integrated into the environment.
*   **Ambient Shadows:** If an element must float (like a FAB or a Modal), use a "Sunken Shadow":
    *   **Color:** `on-surface` (#4e2120) at 6% opacity.
    *   **Blur:** 40px to 60px.
    *   **Spread:** -5px.
    *   This mimics natural, ambient light rather than a harsh artificial glow.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility, use the `outline-variant` token at **15% opacity**. Never use 100% opaque borders.

## 5. Components & Signature Patterns

### Buttons: The "Soft-Touch" Action
*   **Primary:** Uses the `primary` (#a83206) fill with `on-primary` text. Use the `xl` (3rem) corner radius to create a "pill" shape that feels friendly and safe.
*   **Secondary:** Uses `secondary-container` (#7fe6db). This teal-based button should be used for supportive actions (e.g., "Add Gallery Photo").
*   **States:** On hover, shift the background to `primary-dim`. On press, use a subtle inner shadow to simulate a physical "push."

### Cards: The "Containerless" Content
*   **Rule:** Forbid the use of divider lines within cards.
*   **Layout:** Separate the pet's name (`title-lg`) from the pet's breed (`body-md`) using vertical white space (16px or 24px) rather than a horizontal rule.
*   **Imagery:** Use the `lg` (2rem) corner radius for pet photos. Images should occasionally "break" the top edge of the card to create visual interest.

### Inputs: The "Clear Field"
*   **Style:** Filled inputs using `surface-container` background. 
*   **Indicator:** Instead of a full-border focus, use a 3px bottom-accent in `secondary` teal when the field is active.

### Pet-Centric Extras
*   **Status Badges:** Use `secondary-fixed` for positive pet statuses (e.g., "Vaccinated") and `error-container` for alerts (e.g., "Needs Checkup").
*   **Iconography:** Icons must be "Open-Line" style—avoid filled, heavy icons. Use a 1.5pt stroke weight to match the weight of the `body-lg` text.

## 6. Do's and Don'ts

### Do:
*   **Do** embrace white space. If a layout feels "crowded," increase the padding to the next step on the `Roundedness Scale`.
*   **Do** use asymmetrical image placement. A cat looking into the frame from the right edge is more engaging than a centered square.
*   **Do** prioritize `surface-tint` for subtle brand moments in background washes.

### Don't:
*   **Don't** use pure black (#000000) for text. Always use `on-surface` (#4e2120) to maintain the warmth of the palette.
*   **Don't** use 1px dividers. If you feel you need a divider, you actually need 24px of additional white space.
*   **Don't** use "Default" shadows. If the shadow doesn't have a tint of the brand's brown/red, it doesn't belong in this system.