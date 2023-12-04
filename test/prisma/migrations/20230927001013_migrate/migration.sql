-- CreateTable
CREATE TABLE "TypeTest" (
    "id" TEXT NOT NULL,
    "scalarList" TEXT[],
    "role" "Role" NOT NULL,

    CONSTRAINT "TypeTest_pkey" PRIMARY KEY ("id")
);
