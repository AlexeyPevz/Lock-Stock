import Database from "better-sqlite3";
import { logger } from "../utils/logger";

export interface BotStats {
  // Пользователи
  totalUsers: number;
  activeUsersToday: number;
  activeUsersWeek: number;
  newUsersToday: number;
  premiumUsers: number;
  
  // Игры и раунды
  totalGames: number;
  totalRounds: number;
  roundsToday: number;
  roundsWeek: number;
  avgRoundsPerGame: number;
  
  // Генерация
  totalGenerations: number;
  generationsToday: number;
  generationSuccessRate: string;
  avgGenerationTime: number;
  generationsByModel: Record<string, number>;
  
  // Качество
  avgRating: number;
  totalRatings: number;
  verificationSuccessRate: string;
  
  // Использование функций
  commandUsage: Record<string, number>;
  skipUsage: number;
  timerUsage: Record<string, number>;
  
  // Пакеты и платежи
  packagesSold: Record<string, number>;
  totalRevenue: number;
  revenueToday: number;
  
  // Системные метрики
  uptimeHours: number;
  errorRate: string;
  avgResponseTime: number;
}

export class StatsCollector {
  private db: Database.Database;
  private startTime: Date;
  
  constructor(db: Database.Database) {
    this.db = db;
    this.startTime = new Date();
    this.initTables();
  }
  
  private initTables() {
    // Таблица для логирования событий
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bot_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        user_id INTEGER,
        chat_id INTEGER,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_events_type ON bot_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_user ON bot_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_events_created ON bot_events(created_at);
    `);
    
    // Таблица для метрик генерации
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS generation_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model TEXT NOT NULL,
        success BOOLEAN NOT NULL,
        attempts INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_gen_model ON generation_metrics(model);
      CREATE INDEX IF NOT EXISTS idx_gen_created ON generation_metrics(created_at);
    `);
    
    // Таблица для пользовательских сессий
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        user_id INTEGER PRIMARY KEY,
        first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_games INTEGER DEFAULT 0,
        total_rounds INTEGER DEFAULT 0,
        is_premium BOOLEAN DEFAULT FALSE,
        premium_since DATETIME
      );
    `);
  }
  
  // Логирование событий
  logEvent(eventType: string, userId?: number, chatId?: number, data?: any) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO bot_events (event_type, user_id, chat_id, data)
        VALUES (?, ?, ?, ?)
      `);
      
      stmt.run(
        eventType,
        userId || null,
        chatId || null,
        data ? JSON.stringify(data) : null
      );
    } catch (error) {
      logger.error("Failed to log event", { error, eventType });
    }
  }
  
  // Логирование метрик генерации
  logGeneration(model: string, success: boolean, attempts: number, durationMs: number, error?: string) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO generation_metrics (model, success, attempts, duration_ms, error)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run(model, success ? 1 : 0, attempts, durationMs, error || null);
    } catch (error) {
      logger.error("Failed to log generation metric", { error });
    }
  }
  
  // Обновление пользовательской сессии
  updateUserSession(userId: number, updates: {
    gamesPlayed?: number;
    roundsPlayed?: number;
    isPremium?: boolean;
  }) {
    try {
      // Сначала создаем запись если её нет
      this.db.prepare(`
        INSERT OR IGNORE INTO user_sessions (user_id) VALUES (?)
      `).run(userId);
      
      // Обновляем данные
      const updateParts: string[] = ["last_seen = CURRENT_TIMESTAMP"];
      const values: any[] = [];
      
      if (updates.gamesPlayed !== undefined) {
        updateParts.push("total_games = total_games + ?");
        values.push(updates.gamesPlayed);
      }
      
      if (updates.roundsPlayed !== undefined) {
        updateParts.push("total_rounds = total_rounds + ?");
        values.push(updates.roundsPlayed);
      }
      
      if (updates.isPremium !== undefined) {
        updateParts.push("is_premium = ?");
        values.push(updates.isPremium ? 1 : 0);
        if (updates.isPremium) {
          updateParts.push("premium_since = COALESCE(premium_since, CURRENT_TIMESTAMP)");
        }
      }
      
      values.push(userId);
      
      this.db.prepare(`
        UPDATE user_sessions 
        SET ${updateParts.join(", ")}
        WHERE user_id = ?
      `).run(...values);
      
    } catch (error) {
      logger.error("Failed to update user session", { error, userId });
    }
  }
  
  // Получение статистики
  async getStats(): Promise<BotStats> {
    try {
      // Пользователи
      const totalUsers = this.db.prepare("SELECT COUNT(*) as count FROM user_sessions").get() as any;
      const activeToday = this.db.prepare(`
        SELECT COUNT(DISTINCT user_id) as count FROM bot_events 
        WHERE created_at >= date('now')
      `).get() as any;
      const activeWeek = this.db.prepare(`
        SELECT COUNT(DISTINCT user_id) as count FROM bot_events 
        WHERE created_at >= date('now', '-7 days')
      `).get() as any;
      const newToday = this.db.prepare(`
        SELECT COUNT(*) as count FROM user_sessions 
        WHERE date(first_seen) = date('now')
      `).get() as any;
      const premiumUsers = this.db.prepare(`
        SELECT COUNT(*) as count FROM user_sessions WHERE is_premium = 1
      `).get() as any;
      
      // Игры и раунды
      const gameStats = this.db.prepare(`
        SELECT 
          COUNT(CASE WHEN event_type = 'game_started' THEN 1 END) as total_games,
          COUNT(CASE WHEN event_type = 'round_revealed' THEN 1 END) as total_rounds
        FROM bot_events
      `).get() as any;
      
      const roundsToday = this.db.prepare(`
        SELECT COUNT(*) as count FROM bot_events 
        WHERE event_type = 'round_revealed' AND created_at >= date('now')
      `).get() as any;
      
      const roundsWeek = this.db.prepare(`
        SELECT COUNT(*) as count FROM bot_events 
        WHERE event_type = 'round_revealed' AND created_at >= date('now', '-7 days')
      `).get() as any;
      
      // Генерация
      const genStats = this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN success = 1 THEN 1 END) as successful,
          AVG(duration_ms) as avg_duration
        FROM generation_metrics
      `).get() as any;
      
      const genToday = this.db.prepare(`
        SELECT COUNT(*) as count FROM generation_metrics 
        WHERE created_at >= date('now')
      `).get() as any;
      
      const genByModel = this.db.prepare(`
        SELECT model, COUNT(*) as count 
        FROM generation_metrics 
        GROUP BY model
      `).all() as any[];
      
      // Качество
      const qualityStats = this.db.prepare(`
        SELECT 
          AVG(CAST(json_extract(data, '$.rating') AS REAL)) as avg_rating,
          COUNT(*) as total_ratings
        FROM bot_events 
        WHERE event_type = 'feedback_rating' AND data IS NOT NULL
      `).get() as any;
      
      // Команды
      const commandUsage = this.db.prepare(`
        SELECT 
          json_extract(data, '$.command') as command,
          COUNT(*) as count
        FROM bot_events 
        WHERE event_type = 'command_used' 
        GROUP BY command
      `).all() as any[];
      
      // Платежи
      const paymentStats = this.db.prepare(`
        SELECT 
          json_extract(data, '$.package_id') as package_id,
          COUNT(*) as count,
          SUM(CAST(json_extract(data, '$.price_stars') AS INTEGER)) as revenue
        FROM bot_events 
        WHERE event_type = 'payment_successful'
        GROUP BY package_id
      `).all() as any[];
      
      // Собираем результат
      const uptimeHours = (Date.now() - this.startTime.getTime()) / (1000 * 60 * 60);
      
      return {
        totalUsers: totalUsers.count || 0,
        activeUsersToday: activeToday.count || 0,
        activeUsersWeek: activeWeek.count || 0,
        newUsersToday: newToday.count || 0,
        premiumUsers: premiumUsers.count || 0,
        
        totalGames: gameStats.total_games || 0,
        totalRounds: gameStats.total_rounds || 0,
        roundsToday: roundsToday.count || 0,
        roundsWeek: roundsWeek.count || 0,
        avgRoundsPerGame: gameStats.total_games > 0 
          ? (gameStats.total_rounds / gameStats.total_games).toFixed(1) 
          : 0,
        
        totalGenerations: genStats.total || 0,
        generationsToday: genToday.count || 0,
        generationSuccessRate: genStats.total > 0 
          ? ((genStats.successful / genStats.total) * 100).toFixed(1) + '%'
          : '0%',
        avgGenerationTime: genStats.avg_duration ? Math.round(genStats.avg_duration) : 0,
        generationsByModel: genByModel.reduce((acc, row) => {
          acc[row.model] = row.count;
          return acc;
        }, {}),
        
        avgRating: qualityStats.avg_rating || 0,
        totalRatings: qualityStats.total_ratings || 0,
        verificationSuccessRate: '0%', // TODO: Implement
        
        commandUsage: commandUsage.reduce((acc, row) => {
          if (row.command) acc[row.command] = row.count;
          return acc;
        }, {}),
        skipUsage: 0, // TODO: Implement
        timerUsage: {}, // TODO: Implement
        
        packagesSold: paymentStats.reduce((acc, row) => {
          if (row.package_id) acc[row.package_id] = row.count;
          return acc;
        }, {}),
        totalRevenue: paymentStats.reduce((sum, row) => sum + (row.revenue || 0), 0),
        revenueToday: 0, // TODO: Implement
        
        uptimeHours: parseFloat(uptimeHours.toFixed(1)),
        errorRate: '0%', // TODO: Implement from error logs
        avgResponseTime: 0, // TODO: Implement
      };
      
    } catch (error) {
      logger.error("Failed to get stats", { error });
      throw error;
    }
  }
  
  // Получение данных для графиков
  async getChartData(metric: string, days: number = 7) {
    try {
      let query = "";
      
      switch (metric) {
        case "users":
          query = `
            SELECT 
              date(created_at) as date,
              COUNT(DISTINCT user_id) as value
            FROM bot_events
            WHERE created_at >= date('now', '-${days} days')
            GROUP BY date(created_at)
            ORDER BY date
          `;
          break;
          
        case "rounds":
          query = `
            SELECT 
              date(created_at) as date,
              COUNT(*) as value
            FROM bot_events
            WHERE event_type = 'round_revealed' 
              AND created_at >= date('now', '-${days} days')
            GROUP BY date(created_at)
            ORDER BY date
          `;
          break;
          
        case "generations":
          query = `
            SELECT 
              date(created_at) as date,
              COUNT(*) as value,
              COUNT(CASE WHEN success = 1 THEN 1 END) as successful
            FROM generation_metrics
            WHERE created_at >= date('now', '-${days} days')
            GROUP BY date(created_at)
            ORDER BY date
          `;
          break;
          
        case "revenue":
          query = `
            SELECT 
              date(created_at) as date,
              SUM(CAST(json_extract(data, '$.price_stars') AS INTEGER)) as value
            FROM bot_events
            WHERE event_type = 'payment_successful'
              AND created_at >= date('now', '-${days} days')
            GROUP BY date(created_at)
            ORDER BY date
          `;
          break;
      }
      
      if (!query) return [];
      
      return this.db.prepare(query).all();
      
    } catch (error) {
      logger.error("Failed to get chart data", { error, metric });
      return [];
    }
  }
}

// Глобальный экземпляр
let statsCollector: StatsCollector | null = null;

export function initStatsCollector(db: Database.Database) {
  statsCollector = new StatsCollector(db);
  return statsCollector;
}

export function getStatsCollector(): StatsCollector {
  if (!statsCollector) {
    throw new Error("Stats collector not initialized");
  }
  return statsCollector;
}