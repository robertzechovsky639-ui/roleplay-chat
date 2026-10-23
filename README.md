# Roleplay Chat (statická webová aplikace)
Spuštění: `python3 -m http.server 8080` v této složce a otevři http://127.0.0.1:8080 (ne „localhost“ – bezplatné API Pollinations ho blokuje)
V ⚙ Nastavení zadej Base URL (OpenAI kompatibilní, např. https://api.openai.com/v1), model a API klíč. Klíč se ukládá jen do localStorage.
Proměnné {{char}} a {{user}} v popisu/scénáři/úvodní zprávě se nahrazují.

Poskytovatelé: Zdarma online (Pollinations, výchozí, bez klíče) · Lokálně v prohlížeči (WebLLM, vyžaduje WebGPU) · Vlastní OpenAI kompatibilní API s klíčem.
Paměť: dlouhé chaty se automaticky shrnují stejným poskytovatelem (po 24 nových zprávách, posledních 10 zůstává doslovně).
