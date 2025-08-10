import Database from "better-sqlite3";
import { logger } from "./logger";

export interface HealthStatus {
  status: "healthy" | "unhealthy";
  timestamp: string;
  checks: {
    database: boolean;
    memory: boolean;
    uptime: number;
  };
  metrics: {
    totalRounds: number;
    totalFacts: number;
    verifiedRounds: number;
    activeSessions: number;
    memoryUsageMB: number;
  };
}

export class HealthChecker {
  private startTime = Date.now();

  constructor(
    private db: Database.Database,
    private sessions: Map<number, any>
  ) {}

  async check(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    try {
      // Check database
      const dbHealthy = this.checkDatabase();
      
      // Check memory
      const memoryUsage = process.memoryUsage();
      const memoryUsageMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      const memoryHealthy = memoryUsageMB < 500; // Alert if > 500MB

      // Get metrics
      const metrics = this.getMetrics(memoryUsageMB);

      const allHealthy = dbHealthy && memoryHealthy;

      return {
        status: allHealthy ? "healthy" : "unhealthy",
        timestamp,
        checks: {
          database: dbHealthy,
          memory: memoryHealthy,
          uptime,
        },
        metrics,
      };
    } catch (error: any) {
      logger.error("Health check failed", { error });
      return {
        status: "unhealthy",
        timestamp,
        checks: {
          database: false,
          memory: false,
          uptime,
        },
        metrics: {
          totalRounds: 0,
          totalFacts: 0,
          verifiedRounds: 0,
          activeSessions: 0,
          memoryUsageMB: 0,
        },
      };
    }
  }

  private checkDatabase(): boolean {
    try {
      const result = this.db.prepare("SELECT 1").get();
      return result !== undefined;
    } catch {
      return false;
    }
  }

  private getMetrics(memoryUsageMB: number) {
    try {
      const totalRounds = (this.db.prepare("SELECT COUNT(*) as count FROM rounds").get() as any)?.count || 0;
      const totalFacts = (this.db.prepare("SELECT COUNT(*) as count FROM facts_by_number").get() as any)?.count || 0;
      const verifiedRounds = (this.db.prepare("SELECT COUNT(*) as count FROM rounds WHERE verified = 1").get() as any)?.count || 0;
      const activeSessions = this.sessions.size;

      return {
        totalRounds,
        totalFacts,
        verifiedRounds,
        activeSessions,
        memoryUsageMB,
      };
    } catch {
      return {
        totalRounds: 0,
        totalFacts: 0,
        verifiedRounds: 0,
        activeSessions: 0,
        memoryUsageMB,
      };
    }
  }

  async logHealth(): Promise<void> {
    const health = await this.check();
    if (health.status === "unhealthy") {
      logger.error("Health check failed", { health });
    } else {
      logger.info("Health check passed", { metrics: health.metrics });
    }
  }
}