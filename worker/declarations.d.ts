declare module "google-trends-api" {
  interface InterestOverTimeOptions {
    keyword: string | string[];
    geo?: string;
    startTime?: Date;
    endTime?: Date;
    hl?: string;
    timezone?: number;
    category?: number;
  }

  const googleTrends: {
    interestOverTime(options: InterestOverTimeOptions): Promise<string>;
    interestByRegion(options: InterestOverTimeOptions): Promise<string>;
    relatedQueries(options: InterestOverTimeOptions): Promise<string>;
    relatedTopics(options: InterestOverTimeOptions): Promise<string>;
    dailyTrends(options: { geo?: string; trendDate?: Date }): Promise<string>;
    realTimeTrends(options: { geo?: string; category?: string }): Promise<string>;
  };

  export default googleTrends;
}
