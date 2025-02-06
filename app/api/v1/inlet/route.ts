import { NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/db/users";
import { query } from "@/lib/db/client";

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const user = await getOrCreateUser(data.user);
    const modelId = data.body?.model;

    // 如果用户被拉黑,返回余额为 -1
    if (user.deleted) {
      return NextResponse.json({
        success: true,
        balance: -1,
        message: "Request successful",
      });
    }

    // 获取预扣费金额
    const inletCostResponse = await fetch(
      `${
        process.env.VERCEL_URL || "http://localhost:3000"
      }/api/v1/models/inlet-cost?model=${modelId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
        },
      }
    );

    const inletCostData = await inletCostResponse.json();
    const inletCost = inletCostData.success ? inletCostData.cost : 0;

    // 预扣费
    if (inletCost > 0) {
      const userResult = await query(
        `UPDATE users 
         SET balance = LEAST(
           balance - CAST($1 AS DECIMAL(16,4)),
           999999.9999
         )
         WHERE id = $2 AND NOT deleted
         RETURNING balance`,
        [inletCost, user.id]
      );

      if (userResult.rows.length === 0) {
        throw new Error("Failed to update user balance");
      }

      return NextResponse.json({
        success: true,
        balance: Number(userResult.rows[0].balance),
        inlet_cost: inletCost,
        message: "Request successful",
      });
    }

    return NextResponse.json({
      success: true,
      balance: Number(user.balance),
      message: "Request successful",
    });
  } catch (error) {
    console.error("Inlet error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Error dealing with request",
        error_type: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      },
      { status: 500 }
    );
  }
}
