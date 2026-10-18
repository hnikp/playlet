<script lang="ts">
  import { PlayletApi } from "lib/Api/PlayletApi";
  import { translate, userPreferencesStore } from "lib/Stores";

  const textSizes = ["text-2xl", "text-lg", "text-base", "text-sm", "text-xs"];
  const invidiousPublicInstancesLink = `<a class="link" href="https://api.invidious.io" target="_blank" rel="noopener noreferrer">https://api.invidious.io</a>`;

  export let displayText: string = "";
  export let key: string = "";
  export let description: string = "";
  export let level: number = 0;
  // Sensitive values (like API keys) come masked from the TV: the input starts empty
  // and the mask is only shown as a placeholder, so it is never sent back.
  export let sensitive: boolean = false;

  let inputValue;
  let currentValue;
  userPreferencesStore.subscribe((userPreferences) => {
    currentValue = userPreferences[key];
    inputValue = sensitive ? "" : currentValue;
  });

  async function save() {
    if (key !== "") {
      const value = inputValue;
      await PlayletApi.saveUserPreference(key, value);
      if (sensitive) {
        await reloadPreferences();
      } else {
        currentValue = inputValue = value;
      }
    }
  }

  async function clear() {
    if (key !== "") {
      await PlayletApi.saveUserPreference(key, "");
      await reloadPreferences();
    }
  }

  async function reloadPreferences() {
    // The TV computes the new mask
    userPreferencesStore.set(await PlayletApi.getUserPreferences());
  }
</script>

<div class="m-5">
  <div class={textSizes[level]}>{$translate(displayText)}</div>
  <div class="text-xs text-gray-500">
    <!-- TODO:P2 this should not be hardcoded here -->
    {@html $translate(description).replace(
      "%INVIDIOUS_PUBLIC_INSTANCES%",
      invidiousPublicInstancesLink
    )}
  </div>

  <div class="join w-full m-1">
    {#if sensitive}
      <input
        type="password"
        name={key}
        autocomplete="off"
        bind:value={inputValue}
        placeholder={currentValue || displayText}
        class="join-item input w-full mr-1"
      />
      {#if inputValue}
        <button class="join-item btn" on:click={save}>{$translate("Save")}</button
        >
      {:else if currentValue}
        <button class="join-item btn" on:click={clear}
          >{$translate("Clear")}</button
        >
      {/if}
    {:else}
      <input
        type="text"
        name={key}
        bind:value={inputValue}
        placeholder={displayText}
        class="join-item input w-full mr-1"
      />
      {#if inputValue !== currentValue}
        <button class="join-item btn" on:click={save}>{$translate("Save")}</button
        >
      {/if}
    {/if}
  </div>
</div>
