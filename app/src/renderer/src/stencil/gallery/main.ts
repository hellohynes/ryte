import '../tokens.css'
import '../colors.css'
import '../layout.css'
import '../text.css'
import '../button.css'
import '../input.css'
import '../notice.css'
import '../controls.css'
import '../overlay.css'
import '../prose.css'
import '../../assets/theme.css'
import '../../assets/base.css'
import './gallery.css'

import { createApp } from 'vue'

import { applyFont } from '../../fonts/load-fonts'
import Gallery from './Gallery.vue'

void applyFont()
createApp(Gallery).mount('#gallery')
