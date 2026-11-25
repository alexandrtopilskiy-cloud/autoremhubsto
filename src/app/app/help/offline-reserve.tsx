import Image from "next/image";

const masterSettings = { src: "/help/offline/master-settings.png", width: 714, height: 235 };
const workstationDownload = { src: "/help/offline/workstation-download.png", width: 714, height: 236 };
const workstationLinked = { src: "/help/offline/workstation-linked.png", width: 714, height: 126 };

export const offlineReserveSections = [
  { id: "appoint-master", title: "1. Назначить мастера" },
  { id: "pair-workstation", title: "2. Привязать ПК" },
  { id: "check-workstation", title: "3. Проверить привязку" },
  { id: "view-orders-offline", title: "4. Открыть заказ-наряды без интернета" },
  { id: "questions", title: "Частые вопросы" },
] as const;

function Screenshot({ image, alt, caption }: { image: { src: string; width: number; height: number }; alt: string; caption: string }) {
  return (
    <figure className="space-y-2">
      <a href={image.src} target="_blank" rel="noreferrer" aria-label={`Открыть изображение: ${alt}`} className="block rounded-md border border-slate-200">
        <Image {...image} alt={alt} unoptimized className="h-auto w-full rounded-md" />
      </a>
      <figcaption className="text-sm text-slate-600">{caption}</figcaption>
    </figure>
  );
}

export function OfflineReserveGuide() {
  const [master, pairing, check, viewOrders, questions] = offlineReserveSections;
  return (
    <div className="space-y-7 text-[15px] leading-relaxed text-slate-700">
      <p>Для каждой СТО можно назначить одного мастера офлайн-резерва и привязать один рабочий компьютер. Для первичной настройки нужны интернет и ПК с Windows x64.</p>
      <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-blue-950">
        Резервный ПК хранит снимок данных СТО и открывает сохранённые заказ-наряды без интернета в режиме просмотра.
      </p>

      <section id={master.id} className="scroll-mt-4 space-y-3 border-t border-slate-200 pt-5">
        <h3 className="text-lg font-semibold text-slate-900">{master.title}</h3>
        <p>Этот шаг выполняет владелец СТО.</p>
        <ol className="list-decimal space-y-1 pl-6">
          <li>Откройте <strong>Управление → Настройки компании → Офлайн-резерв</strong>.</li>
          <li>В поле <strong>«Мастер офлайн-резерва»</strong> выберите сотрудника и нажмите <strong>«Сохранить мастера»</strong>. Для загрузки снимка владелец назначает мастером себя.</li>
        </ol>
        <Screenshot image={masterSettings} alt="Поле выбора мастера и кнопка «Сохранить мастера»" caption="Карточка офлайн-резерва в настройках компании." />
      </section>

      <section id={pairing.id} className="scroll-mt-4 space-y-3 border-t border-slate-200 pt-5">
        <h3 className="text-lg font-semibold text-slate-900">{pairing.title}</h3>
        <p>Назначенный мастер выполняет эти действия на компьютере, который будет использоваться для резерва.</p>
        <ol className="list-decimal space-y-1 pl-6">
          <li>Войдите в кабинет под аккаунтом мастера и откройте <strong>«Резервный ПК»</strong> в левом меню.</li>
          <li>Скачайте <strong>AutoRemHub-PC.exe</strong> и запустите файл. Если открылся офлайн-кабинет, нажмите «Привязать ПК».</li>
          <li>На сайте нажмите <strong>«Получить код»</strong>, затем <strong>«Скопировать код»</strong>. Код действует 10 минут.</li>
          <li>Вставьте код в окно программы и нажмите <strong>«Привязать ПК»</strong>. Дождитесь сообщения об успешной привязке.</li>
        </ol>
        <Screenshot image={workstationDownload} alt="Ссылка скачивания AutoRemHub-PC.exe и кнопка «Получить код»" caption="На странице «Резервный ПК» можно скачать программу и получить код." />
      </section>

      <section id={check.id} className="scroll-mt-4 space-y-3 border-t border-slate-200 pt-5">
        <h3 className="text-lg font-semibold text-slate-900">{check.title}</h3>
        <p>Вернитесь в кабинет и нажмите <strong>«Проверить статус»</strong>. Если привязка завершена, вы увидите <strong>«ПК привязан»</strong> и имя компьютера. Владелец видит имя этого ПК в карточке «Офлайн-резерв».</p>
        <Screenshot image={workstationLinked} alt="Статус «ПК привязан» и имя тестового компьютера PRIEMKA-01" caption="Подтверждение привязки в кабинете мастера." />
      </section>

      <section id={viewOrders.id} className="scroll-mt-4 space-y-3 border-t border-slate-200 pt-5">
        <h3 className="text-lg font-semibold text-slate-900">{viewOrders.title}</h3>
        <ol className="list-decimal space-y-1 pl-6">
          <li>На привязанном ПК войдите на сайт под аккаунтом владельца, назначенного мастером. В разделе «Резервный ПК» скачайте актуальный <strong>AutoRemHub-PC.exe</strong>.</li>
          <li>Нажмите <strong>«Получить код загрузки»</strong>. Вставьте его в окно программы и нажмите <strong>«Загрузить снимок»</strong>.</li>
          <li>Дождитесь подтверждения. На сайте обновите статус и проверьте надпись <strong>«Снимок данных подтверждён сервером»</strong>.</li>
          <li>Закройте программу, отключите интернет и снова откройте EXE под тем же пользователем Windows. Найдите заказ-наряд по номеру, клиенту, госномеру или VIN.</li>
        </ol>
      </section>

      <section id={questions.id} className="scroll-mt-4 space-y-2 border-t border-slate-200 pt-5">
        <h3 className="mb-3 text-lg font-semibold text-slate-900">{questions.title}</h3>
        <details className="rounded-md border border-slate-200 px-3 py-2">
          <summary className="cursor-pointer font-medium text-slate-900">Почему я не вижу «Резервный ПК»?</summary>
          <p className="mt-2">Пункт доступен только мастеру, которого владелец назначил для вашей СТО. Проверьте, под каким аккаунтом вы вошли.</p>
        </details>
        <details className="rounded-md border border-slate-200 px-3 py-2">
          <summary className="cursor-pointer font-medium text-slate-900">Что делать, если код истёк или уже использован?</summary>
          <p className="mt-2">Нажмите «Проверить статус». Затем получите новый код привязки или загрузки в зависимости от действия, которое хотите повторить.</p>
        </details>
        <details className="rounded-md border border-slate-200 px-3 py-2">
          <summary className="cursor-pointer font-medium text-slate-900">Как обновить данные на резервном ПК?</summary>
          <p className="mt-2">Подключитесь к интернету, получите новый код загрузки и загрузите снимок. Дата сохранённой копии отображается над списком заказ-нарядов.</p>
        </details>
        <details className="rounded-md border border-slate-200 px-3 py-2">
          <summary className="cursor-pointer font-medium text-slate-900">Что означает статус сверки данных?</summary>
          <p className="mt-2">Статус отображается в разделе «Резервный ПК». Подтверждение относится к совпадению снимка данных с сервером. После изменений на сервере нужна новая сверка. Сам статус привязки показывает только регистрацию устройства.</p>
        </details>
        <details className="rounded-md border border-slate-200 px-3 py-2">
          <summary className="cursor-pointer font-medium text-slate-900">Как заменить компьютер или мастера?</summary>
          <p className="mt-2">При замене ПК владелец нажимает «Отвязать ПК» в настройках СТО, затем мастер повторяет привязку на новом компьютере. Если владелец назначит другого мастера, прежняя привязка будет сброшена автоматически.</p>
        </details>
      </section>
    </div>
  );
}
