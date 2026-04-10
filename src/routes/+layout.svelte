<script lang="ts">
    import "../app.css";
    let { children } = $props();
</script>

<div
    data-tauri-drag-region
    class="h-screen w-screen bg-background text-foreground antialiased selection:bg-primary selection:text-primary-foreground"
>
    {@render children()}
</div>
