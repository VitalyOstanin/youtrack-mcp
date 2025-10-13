# YouTrack MCP Server

MCP сервер для полноценной интеграции с YouTrack. Управление задачами, учёт трудозатрат с детальными отчётами, поиск по активности пользователей, работа со статьями базы знаний, доступ к проектам и пользователям. Поддержка учёта времени с конфигурацией праздников/предпраздничных дней, пакетные операции и структурированные ответы для AI-клиентов.

## Содержание

- [YouTrack MCP Server](#youtrack-mcp-server)
  - [Содержание](#содержание)
  - [Требования](#требования)
  - [Установка](#установка)
  - [Запуск сервера (stdio)](#запуск-сервера-stdio)
  - [Конфигурация для Code (Рекомендуется)](#конфигурация-для-code-рекомендуется)
  - [Конфигурация для Claude Code CLI](#конфигурация-для-claude-code-cli)
  - [Инструменты MCP](#инструменты-mcp)
    - [Сервис](#сервис)
    - [Задачи](#задачи)
    - [Трудозатраты](#трудозатраты)
    - [Пользователи и проекты](#пользователи-и-проекты)
    - [Статьи](#статьи)
    - [Примеры structuredContent](#примеры-structuredcontent)
    - [Поиск](#поиск)
  - [Сборка](#сборка)
  - [Разработка](#разработка)
  - [Progress Log](#progress-log)

## Требования

- Node.js ≥ 20
- Переменные окружения:
- `YOUTRACK_URL` — базовый URL YouTrack
- `YOUTRACK_TOKEN` — постоянный токен с правами на чтение задач и work items
- `YOUTRACK_TIMEZONE` — опциональная таймзона для операций с датами (по умолчанию: `Europe/Moscow`), должна быть валидным идентификатором IANA (например, `Europe/London`, `America/New_York`, `Asia/Tokyo`)
- `YOUTRACK_HOLIDAYS` — опциональный список праздничных дат через запятую (формат `YYYY-MM-DD`), исключаемых из отчётов и массовых операций
- `YOUTRACK_PRE_HOLIDAYS` — опциональный список предпраздничных дат через запятую, для которых норма времени уменьшается автоматически
- `YOUTRACK_USER_ALIASES` — опциональный список соответствий `alias:login` через запятую (например, `me:vyt,petya:p.petrov`), используется при автоматическом выборе исполнителей

## Установка

### Используя npx (Рекомендуется)

Вы можете запустить сервер напрямую через npx без установки:

```bash
YOUTRACK_URL="https://youtrack.example.com" \
YOUTRACK_TOKEN="perm:your-token-here" \
npx -y @vitalyostanin/youtrack-mcp
```

### Используя Claude MCP CLI

Установка через Claude MCP CLI:

```bash
claude mcp add --scope user youtrack-mcp npx -y @vitalyostanin/youtrack-mcp
```

После выполнения команды вас попросят ввести URL YouTrack и токен.

**Опции области видимости:**
- `--scope user`: Установка для текущего пользователя (для всех проектов)
- `--scope project`: Установка только для текущего проекта

**Удаление:**

```bash
claude mcp remove youtrack-mcp --scope user
```

### Ручная установка (Для разработки)

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

## Конфигурация для Code (Рекомендуется)

Чтобы использовать этот MCP сервер с [Code](https://github.com/just-every/code), добавьте следующую конфигурацию в `~/.code/config.toml`:

```toml
[mcp_servers.youtrack-mcp]
command = "npx"
args = ["-y", "@vitalyostanin/youtrack-mcp"]
env = { "YOUTRACK_URL" = "https://youtrack.example.com", "YOUTRACK_TOKEN" = "perm:your-token-here" }
```

**Примечание:** Эта конфигурация использует npx для запуска опубликованного пакета. Альтернативно, для локальной разработки используйте `command = "node"` с `args = ["/path/to/dist/index.js"]`.

## Конфигурация для Claude Code CLI

Чтобы использовать этот MCP сервер с [Claude Code CLI](https://github.com/anthropics/claude-code), вы можете:

1. **Использовать Claude MCP CLI** - смотрите секцию [Установка](#установка) выше
2. **Ручная конфигурация** - добавьте в файл `~/.claude.json`:

```json
{
  "mcpServers": {
    "youtrack-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@vitalyostanin/youtrack-mcp"],
      "env": {
        "YOUTRACK_URL": "https://youtrack.example.com",
        "YOUTRACK_TOKEN": "perm:your-token-here"
      }
    }
  }
}
```

**Примечание:** Эта конфигурация использует npx для запуска опубликованного пакета. Для локальной разработки используйте `"command": "node"` с `"args": ["/абсолютный/путь/к/youtrack-mcp/dist/index.js"]`. Переменные окружения `YOUTRACK_TIMEZONE`, `YOUTRACK_HOLIDAYS`, `YOUTRACK_PRE_HOLIDAYS` и `YOUTRACK_USER_ALIASES` являются опциональными.

## Инструменты MCP

Все инструменты возвращают `structuredContent` с флагом `success` и полезной нагрузкой в формате, ожидаемом клиентами MCP.

### Сервис

| Tool | Описание | Основные параметры |
| --- | --- | --- |
| `service_info` | Проверить доступность YouTrack и текущего пользователя | — |

### Задачи

| Tool | Описание | Основные параметры |
| --- | --- | --- |
| `issue_lookup` | Краткая информация о задаче | `issueId` — код задачи (например, PROJ-123) |
| `issue_details` | Полные данные о задаче | `issueId` — код задачи |
| `issue_comments` | Комментарии задачи | `issueId` — код задачи |
| `issue_create` | Создание задачи | `projectId`, `summary`, опционально `description`, `parentIssueId`, `assigneeLogin` |
| `issue_update` | Обновление существующей задачи | `issueId`, опционально `summary`, `description`, `parentIssueId` (пустая строка очищает родителя) |
| `issue_assign` | Назначение исполнителя | `issueId`, `assigneeLogin` (логин или `me`) |
| `issue_comment_create` | Добавление комментария к задаче | `issueId`, `text` — текст комментария |
| `issue_search_by_user_activity` | Поиск задач с активностью пользователей | `userLogins[]` — массив логинов пользователей, опционально `startDate`, `endDate`, `dateFilterMode` (быстрый режим `issue_updated` или точный режим `user_activity`), `limit` (по умолчанию 100, макс 200). Находит задачи, где пользователи обновляли, были упомянуты, создавали, были назначены или комментировали. Быстрый режим фильтрует по полю issue.updated; точный режим проверяет фактические даты активности пользователя, включая комментарии, упоминания и историю изменений полей (например, когда пользователь был исполнителем, который позже был изменён на другого). В точном режиме возвращается поле `lastActivityDate`. Сортировка по времени активности (новые первыми) |

### Трудозатраты

| Tool | Описание | Основные параметры |
| --- | --- | --- |
| `workitems_list` | Получение трудозатрат текущего или указанного пользователя | Опционально `issueId`, `author`, `startDate`, `endDate`, `allUsers` |
| `workitems_all_users` | Получение трудозатрат всех пользователей | Опционально `issueId`, `startDate`, `endDate` |
| `workitems_for_users` | Получение трудозатрат выбранных пользователей | `users[]`, опционально `issueId`, `startDate`, `endDate` |
| `workitems_recent` | Получение последних записей трудозатрат с сортировкой по времени обновления (новые первыми) | Опционально `users[]` (по умолчанию текущий пользователь), `limit` (по умолчанию 50, макс 200) |
| `workitem_create` | Создание записи трудозатрат | `issueId`, `date`, `minutes`, опционально `summary`, `description` |
| `workitem_create_idempotent` | Создание записи без дублей (по описанию и дате) | `issueId`, `date`, `minutes`, `description` |
| `workitem_update` | Обновление записи (пересоздание) | `issueId`, `workItemId`, опционально `date`, `minutes`, `summary`, `description` |
| `workitem_delete` | Удаление записи | `issueId`, `workItemId` |
| `workitems_create_period` | Массовое создание по диапазону дат | `issueId`, `startDate`, `endDate`, `minutes`, опционально `summary`, `description`, `excludeWeekends`, `excludeHolidays`, `holidays[]`, `preHolidays[]` |
| `workitems_report_summary` | Сводный отчёт по трудозатратам | Общие параметры: `author`, `issueId`, `startDate`, `endDate`, `expectedDailyMinutes`, `excludeWeekends`, `excludeHolidays`, `holidays[]`, `preHolidays[]`, `allUsers` |
| `workitems_report_invalid` | Дни с отклонением от нормы | Те же параметры, что и для summary |
| `workitems_report_users` | Отчёт по трудозатратам списка пользователей | `users[]` + общие параметры отчёта |
| `workitems_report` | Структура отчёта (совместимость со старыми клиентами) | Опционально `author`, `issueId`, `startDate`, `endDate`, `expectedDailyMinutes`, `excludeWeekends`, `excludeHolidays`, `holidays[]`, `preHolidays[]`, `allUsers` |

### Пользователи и проекты

| Tool | Описание | Основные параметры |
| --- | --- | --- |
| `users_list` | Список всех пользователей YouTrack | — |
| `user_get` | Получение пользователя по логину | `login` — логин пользователя |
| `user_current` | Получение текущего аутентифицированного пользователя | — |
| `projects_list` | Список всех проектов YouTrack | — |
| `project_get` | Получение проекта по короткому имени | `shortName` — короткое имя проекта |

### Статьи

| Tool | Описание | Основные параметры |
| --- | --- | --- |
| `article_get` | Получение статьи по ID | `articleId` |
| `article_list` | Перечень статей с фильтрами | Опционально `parentArticleId`, `projectId` |
| `article_create` | Создание статьи в базе знаний | `summary`, опционально `content`, `parentArticleId`, `projectId` |
| `article_update` | Обновление статьи | `articleId`, опционально `summary`, `content` |
| `article_search` | Поиск статей в базе знаний | `query`, опционально `projectId`, `parentArticleId`, `limit` |

### Примеры structuredContent

```json
{
  "success": true,
  "summary": {
    "totalMinutes": 480,
    "expectedMinutes": 480,
    "totalHours": 8,
    "expectedHours": 8,
    "workDays": 1,
    "averageHoursPerDay": 8
  },
  "period": {
    "startDate": "2025-10-06",
    "endDate": "2025-10-06"
  },
  "invalidDays": []
}
```

```json
{
  "success": true,
  "item": {
    "id": "123-456",
    "date": 1765238400000,
    "duration": { "minutes": 120, "presentation": "2h" },
    "text": "Code review",
    "issue": { "idReadable": "PROJ-101" }
  }
}
```

### Поиск

| Tool | Описание | Основные параметры |
| --- | --- | --- |
| `article_search` | Поиск статей в базе знаний | `query`, опционально `projectId`, `parentArticleId`, `limit` |

## Сборка

```bash
npm run build
```

## Разработка

```bash
npm run dev
```

## Progress Log

- 2025-10-13 — добавлены расширения конфигурации праздников, новые инструменты трудозатрат и отчётов, примеры structuredContent для клиентов MCP.
- 2025-10-13 — добавлен параметр `dateFilterMode` в инструмент `issue_search_by_user_activity` с двумя режимами: быстрый (`issue_updated`) фильтрует по полю issue.updated, точный (`user_activity`) проверяет фактические даты активности пользователя, включая комментарии, упоминания и историю изменений полей (например, когда пользователь был исполнителем, который позже был изменён на другого). Удалён ненадёжный оператор `commenter:`, добавлены операторы `reporter:` и `assignee:`.
