// Generated from the installed Fontsource packages (Latin faces only); see scripts/generate-font-faces.mjs.
// Each face is its own asset, fetched only when its family is chosen.

export interface FontFaceSource {
  weight: string
  url: () => Promise<string>
}

export const FONT_FACES: Record<string, FontFaceSource[]> = {
  'Geist Variable': [
    {
      weight: '100 900',
      url: () =>
        import('@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'Geist Mono Variable': [
    {
      weight: '100 900',
      url: () =>
        import('@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'Google Sans Variable': [
    {
      weight: '400 700',
      url: () =>
        import('@fontsource-variable/google-sans/files/google-sans-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'Google Sans Code Variable': [
    {
      weight: '300 800',
      url: () =>
        import('@fontsource-variable/google-sans-code/files/google-sans-code-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'Roboto Variable': [
    {
      weight: '100 900',
      url: () =>
        import('@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'Roboto Mono Variable': [
    {
      weight: '100 700',
      url: () =>
        import('@fontsource-variable/roboto-mono/files/roboto-mono-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'IBM Plex Sans Variable': [
    {
      weight: '100 700',
      url: () =>
        import('@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'DM Sans Variable': [
    {
      weight: '100 1000',
      url: () =>
        import('@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'Cascadia Mono Variable': [
    {
      weight: '200 700',
      url: () =>
        import('@fontsource-variable/cascadia-mono/files/cascadia-mono-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'Reddit Sans Variable': [
    {
      weight: '200 900',
      url: () =>
        import('@fontsource-variable/reddit-sans/files/reddit-sans-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'Reddit Mono Variable': [
    {
      weight: '200 900',
      url: () =>
        import('@fontsource-variable/reddit-mono/files/reddit-mono-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'Merriweather Variable': [
    {
      weight: '300 900',
      url: () =>
        import('@fontsource-variable/merriweather/files/merriweather-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'Raleway Variable': [
    {
      weight: '100 900',
      url: () =>
        import('@fontsource-variable/raleway/files/raleway-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'Ubuntu Sans Variable': [
    {
      weight: '100 800',
      url: () =>
        import('@fontsource-variable/ubuntu-sans/files/ubuntu-sans-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'Ubuntu Sans Mono Variable': [
    {
      weight: '400 700',
      url: () =>
        import('@fontsource-variable/ubuntu-sans-mono/files/ubuntu-sans-mono-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'Noto Sans Variable': [
    {
      weight: '100 900',
      url: () =>
        import('@fontsource-variable/noto-sans/files/noto-sans-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'Noto Sans Mono Variable': [
    {
      weight: '100 900',
      url: () =>
        import('@fontsource-variable/noto-sans-mono/files/noto-sans-mono-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'Lora Variable': [
    {
      weight: '400 700',
      url: () =>
        import('@fontsource-variable/lora/files/lora-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'Work Sans Variable': [
    {
      weight: '100 900',
      url: () =>
        import('@fontsource-variable/work-sans/files/work-sans-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'JetBrains Mono Variable': [
    {
      weight: '100 800',
      url: () =>
        import('@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'IBM Plex Mono': [
    {
      weight: '400',
      url: () =>
        import('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url').then(
          (m) => m.default
        )
    },
    {
      weight: '500',
      url: () =>
        import('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url').then(
          (m) => m.default
        )
    },
    {
      weight: '600',
      url: () =>
        import('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2?url').then(
          (m) => m.default
        )
    },
    {
      weight: '700',
      url: () =>
        import('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-700-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ],
  'DM Mono': [
    {
      weight: '400',
      url: () =>
        import('@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2?url').then(
          (m) => m.default
        )
    },
    {
      weight: '500',
      url: () =>
        import('@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff2?url').then(
          (m) => m.default
        )
    }
  ]
}
