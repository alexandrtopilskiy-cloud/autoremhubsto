// Демо-СТО для локальной разработки: вход demo@autoremhub.local / demo12345
import { prisma } from "../src/lib/db";
import { registerCompany } from "../src/lib/services/accounts";
import { addVehicle, createClient } from "../src/lib/services/clients";
import { addItem, addWork, createOrder } from "../src/lib/services/orders";

async function main() {
  const email = "demo@autoremhub.local";
  if (await prisma.user.findUnique({ where: { email } })) {
    console.log("Демо-данные уже есть");
    return;
  }
  const { company } = await registerCompany({
    companyName: "Демо СТО",
    city: "Москва",
    name: "Демо Владелец",
    email,
    password: "demo12345",
  });
  const c = await createClient(company.id, { name: "Сергей Смирнов", phone: "+79001112233" });
  const v = await addVehicle(company.id, c.id, { make: "Toyota", model: "Camry", year: 2018, plate: "А777АА77" });
  const o = await createOrder(company.id, { clientId: c.id, vehicleId: v.id, mileage: 85000, reason: "ТО-60" });
  await addWork(company.id, o.id, { name: "Замена масла ДВС", normHours: 0.5, price: 200000 });
  await addItem(company.id, o.id, { name: "Масло 5W-30", qty: 4.5, price: 90000 });
  console.log(`Готово: ${email} / demo12345`);
}

main().finally(() => prisma.$disconnect());
