export type PageProblem = 'missing' | 'blocked' | 'too-large'

export function describePageProblem(problem: PageProblem, path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  switch (problem) {
    case 'missing':
      return `${name} wasn't found.`
    case 'blocked':
      return `Ryte can't show ${name}.`
    case 'too-large':
      return `${name} is too large to show here.`
  }
}

/** Where an element sits in the window, in whole pixels, as the main process wants it for the page view. */
export function pageBoundsOf(rect: Pick<DOMRect, 'x' | 'y' | 'width' | 'height'>): {
  x: number
  y: number
  width: number
  height: number
} {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height))
  }
}

/**
 * What draws on top of the app in the browser's top layer: an open dialog, a modal, or a popover (menus, popovers,
 * the toaster). A page view is a native view that always draws above all of these, so it steps aside while one is
 * open. A tooltip is brief and small, so it does not count.
 */
export const OVERLAY_SELECTOR =
  'dialog[open], [aria-modal="true"], [popover]:popover-open:not([role="tooltip"])'

export function isOverlayOpen(root: ParentNode): boolean {
  return root.querySelector(OVERLAY_SELECTOR) !== null
}
