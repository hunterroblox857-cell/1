# Ledger

A custom study desk for Vercel. It reads your Trello board through the official REST API and renders your lists as a desk — current work, to-dos, and done — not an embed. Study hours are tracked in this browser because Yeolpumta (YPT) has no public API.

Do not install anything on your Mac. Push this folder and let Vercel build it.

## Deploy

1. Put this project on GitHub (or import the folder in the Vercel dashboard).
2. Import it in [Vercel](https://vercel.com/new). Framework preset: **Other**.
3. Add environment variables, then deploy:

| Name | Where to get it |
| --- | --- |
| `TRELLO_API_KEY` | [Trello Power-Ups admin](https://trello.com/power-ups/admin) → your Power-Up → **API key** |
| `TRELLO_TOKEN` | Same page, generate a **read** token for your account |
| `TRELLO_BOARD_ID` | The short id in `https://trello.com/b/BOARDID/your-board` |

Until those three are set, the site shows sample cards so you can see the layout.

## List names

The large “on the desk” panel picks the first list whose name looks like **Currently doing**, **Doing**, **In progress**, **Now**, or **Today**. Every other list becomes a column. Rename Trello lists to match how you work; nothing else has to change.

Hours on the left are local to the browser you start a session in. They are not fetched from YPT.
