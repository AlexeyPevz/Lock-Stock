#!/bin/bash

echo "🚀 Запуск Lock Stock Question Bot в продакшн режиме..."

# Проверка переменных окружения
if [ ! -f .env ]; then
    echo "❌ Файл .env не найден!"
    echo "   Скопируйте .env.example в .env и настройте"
    exit 1
fi

# Загрузка переменных
export $(cat .env | grep -v '^#' | xargs)

# Проверка обязательных переменных
if [ -z "$BOT_TOKEN" ]; then
    echo "❌ BOT_TOKEN не установлен в .env!"
    exit 1
fi

if [ -z "$OPENROUTER_API_KEY" ]; then
    echo "⚠️  OPENROUTER_API_KEY не установлен!"
    echo "   Генерация вопросов не будет работать"
fi

if [ -z "$ADMIN_USER_IDS" ]; then
    echo "⚠️  ADMIN_USER_IDS не установлен!"
    echo "   Админ-панель будет недоступна"
fi

# Проверка Node.js версии
NODE_VERSION=$(node -v)
echo "📦 Node.js версия: $NODE_VERSION"

# Проверка сборки
if [ ! -d "dist" ]; then
    echo "📦 Сборка не найдена, собираем проект..."
    npm run build
fi

# Проверка конфигурации
if [ ! -f "bot-config.json" ]; then
    echo "📝 Создаем конфигурацию по умолчанию..."
    cp bot-config.example.json bot-config.json
fi

echo "✅ Все проверки пройдены!"
echo "🤖 Запускаем бота..."
echo ""

# Запуск с перезапуском при падении
while true; do
    node dist/index.js
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo "✅ Бот остановлен нормально"
        break
    else
        echo "❌ Бот упал с кодом $EXIT_CODE"
        echo "🔄 Перезапуск через 5 секунд..."
        sleep 5
    fi
done