import { ProfileSwitcherApi } from "./shared/types";

declare global {
  interface Window {
    profileSwitcher: ProfileSwitcherApi;
  }
}

export {};
