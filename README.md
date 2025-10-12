# YouTrack MCP Server

Stdio MCP сервер для быстрого доступа к YouTrack: статус сервиса, детали задач, список трудозатрат.

## Требования

- Node.js ≥ 20
- Переменные окружения:
  - `YOUTRACK_URL` — базовый URL YouTrack
  - `YOUTRACK_TOKEN` — постоянный токен с правами на чтение задач и work items

## Установка

```bash
npm install
npm run build
```

## Запуск сервера (stdio)

```bash
YOUTRACK_URL="https://youtrack.example.com" \
YOUTRACK_TOKEN="perm:example-token" \
node dist/index.js
```

## Инструменты MCP

| Tool | Описание |
| --- | --- |
| `service_info` | Проверить доступность YouTrack и текущего пользователя |
| `issue_lookup` | Краткие данные по задаче (id, summary, проект) |
| `issue_details` | Расширенная информация о задаче |
| `workitems_list` | Список трудозатрат с фильтрами по автору, периоду и задаче |

Ответы возвращаются в `structuredContent` с `success: true/false`.

## Сборка

```bash
npm run build
```

## Разработка

```bash
npm run dev
```
