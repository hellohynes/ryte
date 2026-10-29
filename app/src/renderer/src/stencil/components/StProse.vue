<!-- Renders sanitized markdown HTML with Ryte reading typography. `html` must be output of the markdown renderer, never raw user input. -->
<script lang="ts">
import { defineComponent, h } from 'vue'

/**
 * Rendered markdown. `html` is inserted as markup, so callers must pass generator output only: the
 * markdown renderer runs with raw HTML disabled, and highlighted code comes from the highlighter.
 * Never pass user text or model output directly.
 */
export default defineComponent({
  name: 'StProse',
  props: {
    html: { type: String, required: true },
    as: { type: String, default: 'article' }
  },
  setup(props) {
    return () => h(props.as, { class: 'st-prose', innerHTML: props.html })
  }
})
</script>
