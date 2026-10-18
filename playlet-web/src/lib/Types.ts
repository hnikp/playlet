export const ScreenNames = ["search", "ai-search", "home", "bookmarks", "settings", "info", "remote"] as const;

export enum ProfileAuthState {
    Authenticated = "Authenticated",
    NeedsReauth = "NeedsReauth",
}

export type AppState = {
    screen: "search" | "ai-search" | "home" | "bookmarks" | "settings" | "info" | "remote"
}

export type PlayletState = {
    app?: any,
    device?: any,
    invidious?: any,
    preferences?: any,
    profiles?: any,
}
