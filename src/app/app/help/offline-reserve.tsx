import Image from "next/image";

const masterSettings = { src: "/help/offline/master-settings.png", width: 714, height: 235 };
const workstationDownload = { src: "/help/offline/workstation-download.png", width: 714, height: 236 };
const workstationLinked = { src: "/help/offline/workstation-linked.png", width: 714, height: 126 };

export const offlineReserveSections = [
  { id: "appoint-master", title: "1. Назначить мастера" },
  { id: "pair-workstation", title: "2. Привязать ПК" },
  { id: "check-workstation", title: "3. Проверить привязку" },
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
  const [master, pairing, check, questions] = offlineReserveSections;
  return (
    <div className="space-y-7 text-[15px] leading-relaxed text-slate-700">
      <p>Для каждой СТО можно назначить одного мастера офлайн-резерва и привязать один рабочий компьютер. Для первичной настройки нужны интернет и ПК с Windows x64.</p>
      <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-blue-950">
        В этой версии доступны назначение мастера и привязка ПК. Работа без интернета станет доступна после выпуска локального приложения и синхронизации.
      </p>

      <section id={master.id} className="scroll-mt-4 space-y-3 border-t border-slate-200 pt-5">
        <h3 className="text-lg font-semibold text-slate-900">{master.title}</h3>
        <p>Этот шаг выполняет владелец СТО.</p>
        <ol className="list-decimal space-y-1 pl-6">
          <li>Откройте <strong>Управление → Настройки компании → Офлайн-резерв</strong>.</li>
          <li>В поле <strong>«Мастер офлайн-резерва»</strong> выберите сотрудника и нажмите <strong>«Сохранить мастера»</strong>. Владелец также может назначить себя.</li>
        </ol>
        <Screenshot image={masterSettings} alt="Поле выбора мастера и кнопка «Сохранить мастера»" caption="Карточка офлайн-резерва в настройках компании." />
      </section>

      <section id={pairing.id} className="scroll-mt-4 space-y-3 border-t border-slate-200 pt-5">
        <h3 className="text-lg font-semibold text-slate-900">{pairing.title}</h3>
        <p>Назначенный мастер выполняет эти действия на компьютере, который будет использоваться для резерва.</p>
        <ol className="list-decimal space-y-1 pl-6">
          <li>Войдите в кабинет под аккаунтом мастера и откройте <strong>«Резервный ПК»</strong> в левом меню.</li>
          <li>Скачайте <strong>AutoRemHub-PC.exe</strong> и запустите файл. Откроется окно привязки.</li>
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

      <section id={questions.id} className="scroll-mt-4 space-y-2 border-t border-slate-200 pt-5">
        <h3 className="mb-3 text-lg font-semibold text-slate-900">{questions.title}</h3>
        <details className="rounded-md border border-slate-200 px-3 py-2">
          <summary className="cursor-pointer font-medium text-slate-900">Почему я не вижу «Резервный ПК»?</summary>
          <p className="mt-2">Пункт доступен только мастеру, которого владелец назначил для вашей СТО. Проверьте, под каким аккаунтом вы вошли.</p>
        </details>
        <details className="rounded-md border border-slate-200 px-3 py-2">
          <summary className="cursor-pointer font-medium text-slate-900">Что делать, если код истёк или уже использован?</summary>
          <p className="mt-2">Сначала нажмите «Проверить статус». Если ПК ещё не привязан, получите и скопируйте новый код.</p>
        </details>
        <details className="rounded-md border border-slate-200 px-3 py-2">
          <summary className="cursor-pointer font-medium text-slate-900">Как заменить компьютер или мастера?</summary>
          <p className="mt-2">При замене ПК владелец нажимает «Отвязать ПК» в настройках СТО, затем мастер повторяет привязку на новом компьютере. Если владелец назначит другого мастера, прежняя привязка будет сброшена автоматически.</p>
        </details>
      </section>
    </div>
  );
}
