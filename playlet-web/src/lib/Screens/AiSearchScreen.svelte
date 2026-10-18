<script lang="ts">
  import { PlayletApi } from "lib/Api/PlayletApi";
  import { translate, userPreferencesStore } from "lib/Stores";
  import { addToast } from "lib/Toast";

  export let visibility: boolean;

  type AiSearchState = {
    query?: string;
    status?: "thinking" | "done" | "error";
    text?: string;
    picks?: { title: string; channel: string; reason: string }[];
    queries?: string[];
  };

  const POLL_INTERVAL_MS = 1500;
  const POLL_TIMEOUT_MS = 90000;

  let queryText = "";
  let isSending = false;
  let hasApiKey = true;
  let aiState: AiSearchState = {};
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let textArea: HTMLTextAreaElement;

  userPreferencesStore.subscribe((userPreferences) => {
    // The key itself never reaches the web app: only its mask, which is empty when no key is set
    const apiKey = userPreferences["ai_search.api_key"];
    hasApiKey = apiKey === undefined || apiKey !== "";
  });

  // Show the TV's last search when the page opens
  $: if (visibility) {
    refreshState();
  }

  async function refreshState() {
    try {
      aiState = await PlayletApi.getAiSearchState();
    } catch (error) {
      console.error(error);
    }
  }

  // Follow the search on the TV until it has an answer
  function pollState(q: string, startedAt: number) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
      await refreshState();
      const waiting = aiState.query !== q || aiState.status === "thinking";
      if (waiting && Date.now() - startedAt < POLL_TIMEOUT_MS) {
        pollState(q, startedAt);
      }
    }, POLL_INTERVAL_MS);
  }

  async function askAi() {
    const q = queryText.trim();
    if (q.length === 0 || isSending) {
      return;
    }

    // Closes the phone keyboard
    textArea?.blur();

    try {
      isSending = true;
      await PlayletApi.aiSearch(q);
      aiState = { query: q, status: "thinking", text: $translate("Thinking…") };
      pollState(q, Date.now());
    } catch (error) {
      console.error(error);
      addToast(`${$translate("AI search failed")}: ${(error as Error).message}`, "error");
    } finally {
      isSending = false;
    }
  }
</script>

<div class={visibility ? "" : "hidden"}>
  <div class="m-4">
    <form
      on:submit={async (e) => {
        e.preventDefault();
        await askAi();
      }}
    >
      <div class="text-lg mb-2">{$translate("Describe a video")}</div>
      <textarea
        bind:this={textArea}
        dir="auto"
        rows="4"
        enterkeyhint="send"
        placeholder={$translate(
          "Describe a video, for example: a calm piano video for studying"
        )}
        class="textarea w-full border border-neutral focus:outline-none focus:ring-0"
        bind:value={queryText}
        on:keydown={async (e) => {
          // Enter sends (the phone keyboard shows it as Send), Shift+Enter adds a new line
          if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            await askAi();
          }
        }}
      ></textarea>
      <button
        type="submit"
        class="btn btn-primary rounded-full mt-2 w-full"
        disabled={isSending || queryText.trim().length === 0}
      >
        {#if isSending}
          <span class="loading loading-spinner loading-sm"></span>
        {/if}
        {$translate("Ask AI")}
      </button>
    </form>

    {#if !hasApiKey}
      <div class="text-sm text-gray-500 mt-4">
        {$translate(
          "Set an API key in the AI search settings, or from the Playlet web app on your phone"
        )}
      </div>
    {/if}

    {#if aiState.status}
      <div class="card bg-base-200 mt-4">
        <div class="card-body p-4 gap-2">
          {#if aiState.query}
            <div class="text-sm text-gray-500" dir="auto">“{aiState.query}”</div>
          {/if}

          {#if aiState.status === "thinking"}
            <div class="flex items-center gap-2">
              <span class="loading loading-spinner loading-sm"></span>
              {$translate("Thinking…")}
            </div>
          {:else if aiState.status === "error"}
            <div class="text-error" dir="auto">{aiState.text}</div>
          {:else}
            {#if aiState.text}
              <div dir="auto">{aiState.text}</div>
            {/if}

            {#if aiState.picks && aiState.picks.length > 0}
              <div class="font-semibold mt-2">{$translate("AI picks")}</div>
              <ul class="flex flex-col gap-2">
                {#each aiState.picks as pick}
                  <li dir="auto">
                    <div class="font-medium">{pick.title}</div>
                    {#if pick.channel}
                      <div class="text-sm text-gray-500">{pick.channel}</div>
                    {/if}
                    {#if pick.reason}
                      <div class="text-sm">{pick.reason}</div>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}

            {#if aiState.queries && aiState.queries.length > 0}
              <div class="font-semibold mt-2">{$translate("Suggested searches")}</div>
              <div class="flex flex-wrap gap-2">
                {#each aiState.queries as suggestedQuery}
                  <span class="badge badge-outline h-auto py-1" dir="auto">{suggestedQuery}</span>
                {/each}
              </div>
            {/if}
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
