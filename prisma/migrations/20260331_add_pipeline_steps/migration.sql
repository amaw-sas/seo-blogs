-- CreateTable
CREATE TABLE "pipeline_steps" (
    "id" TEXT NOT NULL,
    "step_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "has_prompt" BOOLEAN NOT NULL DEFAULT true,
    "prompt_base" TEXT,
    "prompt_sections" JSONB NOT NULL DEFAULT '{}',
    "extra_instructions" TEXT,
    "response_format" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gpt-4.1',
    "max_tokens" INTEGER NOT NULL DEFAULT 2000,
    "temperature" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_step_overrides" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "step_key" TEXT NOT NULL,
    "prompt_sections" JSONB,
    "extra_instructions" TEXT,
    "temperature" DOUBLE PRECISION,
    "max_tokens" INTEGER,
    "active" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_step_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_steps_step_key_key" ON "pipeline_steps"("step_key");

-- CreateIndex
CREATE INDEX "pipeline_steps_order_idx" ON "pipeline_steps"("order");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_step_overrides_site_id_step_key_key" ON "pipeline_step_overrides"("site_id", "step_key");

-- AddForeignKey
ALTER TABLE "pipeline_step_overrides" ADD CONSTRAINT "pipeline_step_overrides_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_step_overrides" ADD CONSTRAINT "pipeline_step_overrides_step_key_fkey" FOREIGN KEY ("step_key") REFERENCES "pipeline_steps"("step_key") ON DELETE CASCADE ON UPDATE CASCADE;
