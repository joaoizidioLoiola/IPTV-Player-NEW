import { app } from 'electron';
import { getElectronUserDataPath } from '@iptvnator/shared/database';

// Profile isolation: this product only ever uses its own Chromium profile.
// The only permitted override is the E2E data dir; upstream IPTVnator's
// `electron-backend` profile is never selected, imported or copied.
const override = getElectronUserDataPath();
if (override) app.setPath('userData', override);
