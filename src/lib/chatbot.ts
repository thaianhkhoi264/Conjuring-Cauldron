import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type { AgentTool } from "@/lib/llm";
import { db } from "@/lib/db";
import { assignments, calloffs, employees, recipes, shifts } from "@/lib/db/schema";

export type EmployeeScheduleItem = {
  assignmentId: string;
  date: string;
  slot: string;
  station: string;
  role: string;
  status: string;
};

export function getEmployeeSchedule(employeeId: string): EmployeeScheduleItem[] {
  return db.select({
    assignmentId: assignments.id,
    date: shifts.date,
    slot: shifts.slot,
    station: assignments.station,
    role: assignments.role,
    status: assignments.status,
  })
    .from(assignments)
    .innerJoin(shifts, eq(assignments.shiftId, shifts.id))
    .where(eq(assignments.employeeId, employeeId))
    .orderBy(shifts.date)
    .all();
}

function getRecipeBook() {
  return db.select({ name: recipes.name, station: recipes.station, ingredientsJson: recipes.ingredientsJson }).from(recipes).all()
    .map((recipe) => ({ ...recipe, ingredients: JSON.parse(recipe.ingredientsJson) }));
}

export function requestCalloff(employeeId: string, assignmentId: string, reason: string, confirmed: boolean) {
  const scheduled = getEmployeeSchedule(employeeId).find((item) => item.assignmentId === assignmentId && item.status === "scheduled");
  if (!scheduled) return { error: "That scheduled shift was not found." };
  if (!confirmed) {
    return {
      requiresConfirmation: true,
      assignment: scheduled,
      message: `Please confirm that you want to call off ${scheduled.date} (${scheduled.slot}, ${scheduled.station}).`,
    };
  }

  const existing = db.select().from(calloffs).where(eq(calloffs.assignmentId, assignmentId)).get();
  if (existing) return { error: "A call-off is already open for that shift." };

  db.transaction((tx) => {
    tx.update(assignments).set({ status: "called_off" }).where(eq(assignments.id, assignmentId)).run();
    tx.insert(calloffs).values({ id: randomUUID(), assignmentId, reason: reason || "No reason provided" }).run();
  });
  return { created: true, assignment: scheduled };
}

export function createEmployeeChatTools(employeeId: string, confirmedCalloff: boolean): AgentTool[] {
  return [
    {
      declaration: {
        name: "get_recipe_book",
        description: "Read the restaurant recipe book to answer an employee's recipe question.",
        parametersJsonSchema: { type: "object", properties: {}, additionalProperties: false },
      },
      run: () => getRecipeBook(),
    },
    {
      declaration: {
        name: "get_my_schedule",
        description: "Read this employee's own upcoming schedule.",
        parametersJsonSchema: { type: "object", properties: {}, additionalProperties: false },
      },
      run: () => getEmployeeSchedule(employeeId),
    },
    {
      declaration: {
        name: "request_calloff",
        description: "Find an exact scheduled assignment and begin a call-off. Never claim it is complete until this tool says created is true.",
        parametersJsonSchema: {
          type: "object",
          additionalProperties: false,
          required: ["assignmentId", "reason"],
          properties: { assignmentId: { type: "string" }, reason: { type: "string" } },
        },
      },
      run: (args) => requestCalloff(employeeId, String(args.assignmentId ?? ""), String(args.reason ?? ""), confirmedCalloff),
    },
  ];
}

export function employeeChatSystemPrompt(employeeId: string) {
  const employee = db.select({ name: employees.name }).from(employees).where(eq(employees.id, employeeId)).get();
  if (!employee) throw new Error("Employee not found.");
  return `You are the Conjuring Cauldron employee assistant for ${employee.name}. Answer only recipe-book and this employee's schedule questions. Use tools for facts rather than inventing details. For a call-off request, first use get_my_schedule to identify the exact assignment. The request_calloff tool will require confirmation unless the user has explicitly confirmed in this request. Keep answers friendly and brief.`;
}
