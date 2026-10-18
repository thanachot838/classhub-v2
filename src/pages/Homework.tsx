import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { uploadProof } from '../lib/cloudinary';
import { useAuth } from '../context/AuthContext';
import type { AppUser, HomeworkSubmission, HomeworkTask } from '../types';

// โมดูล 2: Admin สร้าง / แก้ไข / ลบงาน + แนบลิงก์ + แนบรูป · นักเรียนติ๊ก "ทำแล้ว"
// ไม่มีขั้นตอนครูตรวจ — ใช้แค่เช็คว่าใครยังค้างงานอยู่ (Admin กด "ดูสถานะ")
// homework/{taskId} (db=primary) + subcollection submissions/{uid}

const MAX_IMAGES = 5;

async function fetchTasks(): Promise<HomeworkTask[]> {
  const snap = await getDocs(collection(db, 'homework'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as HomeworkTask))
    .sort((a, b) => (a.deadline < b.deadline ? 1 : -1));
}

async function fetchSubmissions(taskId: string): Promise<HomeworkSubmission[]> {
  const snap = await getDocs(collection(db, 'homework', taskId, 'submissions'));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as HomeworkSubmission));
}

async function fetchMySubmission(taskId: string, uid: string): Promise<HomeworkSubmission | null> {
  const ref = doc(db, 'homework', taskId, 'submissions', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? ({ uid: snap.id, ...snap.data() } as HomeworkSubmission) : null;
}

async function fetchStudents(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs
    .map((d) => ({ uid: d.id, ...d.data() } as AppUser))
    .filter((u) => u.role === 'student')
    .sort((a, b) => a.number - b.number);
}

/** วันที่วันนี้ตามเวลาเครื่อง (YYYY-MM-DD) — toISOString ใช้ UTC จะเพี้ยนช่วงเช้ามืดของไทย */
function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function deadlineBadge(deadline: string) {
  const today = todayStr();
  if (deadline < today) return <span className="status-chip danger">เลยกำหนด</span>;
  if (deadline === today) return <span className="status-chip pending">วันนี้</span>;
  return <span className="status-chip ok">ยังทัน</span>;
}

/** รับเฉพาะลิงก์ http(s) กัน javascript: ฯลฯ — คืน null ถ้าใช้ไม่ได้ */
function normalizeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function linkInfo(url: string) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (host === 'padlet.com' || host.endsWith('.padlet.com')) return { icon: '📌', name: 'Padlet' };
  if (host === 'drive.google.com' || host === 'docs.google.com')
    return { icon: '📁', name: 'Google Drive' };
  return { icon: '🔗', name: host };
}

function TaskLinks({ links }: { links?: string[] }) {
  const safe = (links ?? []).filter((l) => normalizeUrl(l));
  if (safe.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {safe.map((url) => {
        const info = linkInfo(url);
        return (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand"
          >
            {info.icon} {info.name}
          </a>
        );
      })}
    </div>
  );
}

/** รูปประกอบงาน — แตะเพื่อดูภาพเต็ม */
function TaskImages({ images }: { images?: string[] }) {
  const [viewing, setViewing] = useState<string | null>(null);
  const list = (images ?? []).filter(Boolean);
  if (list.length === 0) return null;
  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {list.map((url) => (
          <button
            key={url}
            onClick={() => setViewing(url)}
            className="h-20 w-20 overflow-hidden rounded-xl border border-gray-200"
            aria-label="ดูรูปเต็ม"
          >
            <img src={url} alt="รูปประกอบงาน" loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      {viewing && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"
          onClick={() => setViewing(null)}
        >
          <img src={viewing} alt="รูปประกอบงาน" className="max-h-[85vh] max-w-full rounded-xl" />
        </div>
      )}
    </>
  );
}

/** ฟอร์มสร้าง/แก้ไขงาน (Admin) — ส่ง task เข้ามา = โหมดแก้ไข */
function TaskForm({ task, onClose }: { task?: HomeworkTask; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const isEdit = !!task;
  const [subject, setSubject] = useState(task?.subject ?? '');
  const [title, setTitle] = useState(task?.title ?? '');
  const [detail, setDetail] = useState(task?.detail ?? '');
  const [deadline, setDeadline] = useState(task?.deadline ?? todayStr());
  const [links, setLinks] = useState<string[]>(task?.links?.length ? task.links : ['']);
  const [images, setImages] = useState<string[]>(task?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // ให้เลือกไฟล์เดิมซ้ำได้
    if (files.length === 0) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setUploadError(`แนบรูปได้สูงสุด ${MAX_IMAGES} รูป`);
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      for (const f of files.slice(0, room)) {
        const url = await uploadProof(f, 'homework');
        setImages((prev) => [...prev, url]);
      }
      if (files.length > room) setUploadError(`แนบรูปได้สูงสุด ${MAX_IMAGES} รูป เลยแนบให้เท่าที่ได้`);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setUploading(false);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('missing');
      const cleaned: string[] = [];
      for (const raw of links) {
        if (!raw.trim()) continue;
        const url = normalizeUrl(raw);
        if (!url) throw new Error('bad-link');
        cleaned.push(url);
      }
      const data = {
        subject: subject.trim(),
        title: title.trim(),
        detail,
        deadline,
        links: cleaned,
        images,
      };
      if (task) {
        await updateDoc(doc(db, 'homework', task.id), { ...data, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'homework'), {
          ...data,
          createdBy: profile.uid,
          createdAt: serverTimestamp(),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['homework-tasks'] });
      onClose();
    },
  });

  return (
    <section className="glass-card flex flex-col gap-3 p-4">
      <h2 className="font-semibold">{isEdit ? 'แก้ไขงาน' : 'สร้างงานใหม่'}</h2>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="วิชา"
        className="rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm"
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="หัวข้อ"
        className="rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm"
      />
      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="รายละเอียด"
        rows={2}
        className="rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm"
      />
      <label className="text-sm text-gray-600">
        กำหนดส่ง
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="mt-1 w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm"
        />
      </label>

      {/* รูปประกอบงาน */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-gray-600">
          รูปประกอบงาน ({images.length}/{MAX_IMAGES})
        </p>
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((url) => (
              <div key={url} className="relative h-20 w-20">
                <img
                  src={url}
                  alt="รูปประกอบงาน"
                  className="h-full w-full rounded-xl border border-gray-200 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImages(images.filter((u) => u !== url))}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-xs text-white shadow"
                  aria-label="เอารูปนี้ออก"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {images.length < MAX_IMAGES && (
          <label
            className={`self-start cursor-pointer rounded-xl border border-dashed border-brand px-4 py-2 text-sm font-medium text-brand ${
              uploading ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            {uploading ? 'กำลังอัปโหลด...' : '📷 เพิ่มรูป'}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={onPickImages}
              disabled={uploading}
              className="hidden"
            />
          </label>
        )}
        {uploadError && <p className="text-sm text-danger">{uploadError}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-gray-600">ลิงก์แนบ (Padlet / Google Drive / อื่น ๆ)</p>
        {links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={l}
              onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))}
              inputMode="url"
              placeholder="วางลิงก์ที่นี่"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm"
            />
            {links.length > 1 && (
              <button
                onClick={() => setLinks(links.filter((_, j) => j !== i))}
                className="px-2 text-gray-400"
                aria-label="ลบลิงก์นี้"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button onClick={() => setLinks([...links, ''])} className="self-start text-sm text-brand underline">
          ＋ เพิ่มลิงก์
        </button>
      </div>

      {save.isError && (
        <p className="text-sm text-danger">
          {save.error instanceof Error && save.error.message === 'bad-link'
            ? 'ลิงก์ไม่ถูกต้อง ตรวจสอบอีกครั้ง (ต้องเป็น http/https)'
            : (save.error as { code?: string })?.code === 'permission-denied'
              ? 'บันทึกไม่สำเร็จ: ไม่มีสิทธิ์ (ตรวจ Firestore rules ของ homework)'
              : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง'}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 rounded-xl border border-gray-300 py-2 text-sm"
        >
          ยกเลิก
        </button>
        <button
          disabled={!subject.trim() || !title.trim() || save.isPending || uploading}
          onClick={() => save.mutate()}
          className="flex-1 rounded-xl bg-brand py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {save.isPending ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข' : 'บันทึก'}
        </button>
      </div>
    </section>
  );
}

function CreateTask() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl bg-brand py-3 font-semibold text-white shadow-glass active:scale-95"
      >
        ➕ สร้างงานใหม่
      </button>
    );
  }
  return <TaskForm onClose={() => setOpen(false)} />;
}

/** Modal เช็คว่าใครทำแล้ว / ยังค้างอยู่ (Admin) — ดูอย่างเดียว ไม่มีการตรวจ */
function StatusModal({ task, onClose }: { task: HomeworkTask; onClose: () => void }) {
  const { data: students = [] } = useQuery({ queryKey: ['students'], queryFn: fetchStudents });
  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ['homework-submissions', task.id],
    queryFn: () => fetchSubmissions(task.id),
  });

  const doneIds = new Set(submissions.map((s) => s.uid));
  const pending = students.filter((s) => !doneIds.has(s.uid));
  const done = students.filter((s) => doneIds.has(s.uid));

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="glass-card max-h-[85vh] w-full max-w-md overflow-y-auto p-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-bold">{task.title}</h2>
          <button onClick={onClose} className="text-gray-400" aria-label="ปิด">
            ✕
          </button>
        </div>
        {isLoading ? (
          <p className="text-sm text-gray-400">กำลังโหลด...</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-gray-500">
              ยังไม่ทำ {pending.length} คน · ทำแล้ว {done.length} คน
            </p>
            <ul className="flex flex-col gap-2">
              {pending.map((s) => (
                <li
                  key={s.uid}
                  className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2"
                >
                  <span className="text-sm">
                    {s.number}. {s.name}
                  </span>
                  <span className="status-chip danger">ยังไม่ทำ</span>
                </li>
              ))}
              {done.map((s) => (
                <li
                  key={s.uid}
                  className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2"
                >
                  <span className="text-sm text-gray-500">
                    {s.number}. {s.name}
                  </span>
                  <span className="status-chip ok">ทำแล้ว ✓</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** หน้าต่างเตือนก่อนลบงานจริง */
function ConfirmDeleteDialog({
  task,
  pending,
  errorText,
  onConfirm,
  onCancel,
}: {
  task: HomeworkTask;
  pending: boolean;
  errorText: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="glass-card w-full max-w-sm p-5">
        <p className="text-lg font-bold text-danger">ลบงานนี้ใช่ไหม?</p>
        <p className="mt-2 font-semibold">{task.title}</p>
        <p className="text-xs text-gray-400">
          {task.subject} · กำหนดส่ง {task.deadline}
        </p>
        <p className="mt-3 text-sm text-gray-500">
          ข้อมูลว่าใครทำแล้วจะถูกลบไปด้วย และกู้คืนไม่ได้
        </p>
        {errorText && <p className="mt-2 text-sm text-danger">{errorText}</p>}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancel}
            disabled={pending}
            className="flex-1 rounded-xl border border-gray-300 py-2 text-sm disabled:opacity-40"
          >
            ยกเลิก
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="flex-1 rounded-xl bg-danger py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pending ? 'กำลังลบ...' : 'ลบเลย'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** การ์ดงาน 1 ชิ้น มุมมองนักเรียน — ติ๊กว่าทำแล้ว (ไม่ต้องส่งรูป ไม่ต้องรอตรวจ) */
function StudentTaskCard({ task }: { task: HomeworkTask }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: mySubmission } = useQuery({
    queryKey: ['my-submission', task.id, profile?.uid],
    queryFn: () => fetchMySubmission(task.id, profile!.uid),
    enabled: !!profile,
  });

  const toggle = useMutation({
    mutationFn: async (checked: boolean) => {
      if (!profile) throw new Error('missing');
      const ref = doc(db, 'homework', task.id, 'submissions', profile.uid);
      // verified: false คงไว้เพื่อให้ Firestore rules เดิมที่เคยตรวจฟิลด์นี้ยังผ่าน (ไม่ได้ใช้งานแล้ว)
      if (checked) await setDoc(ref, { submittedAt: Date.now(), verified: false });
      else await deleteDoc(ref);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['my-submission', task.id, profile?.uid] }),
  });

  return (
    <div className="glass-card p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-brand">{task.subject}</span>
        {mySubmission ? <span className="status-chip ok">ทำแล้ว</span> : deadlineBadge(task.deadline)}
      </div>
      <h3 className="font-semibold">{task.title}</h3>
      {task.detail && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-500">{task.detail}</p>}
      <p className="mt-1 text-xs text-gray-400">กำหนดส่ง {task.deadline}</p>
      <TaskImages images={task.images} />
      <TaskLinks links={task.links} />

      <button
        onClick={() => toggle.mutate(!mySubmission)}
        disabled={toggle.isPending}
        aria-pressed={!!mySubmission}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold transition active:scale-95 disabled:opacity-50 ${
          mySubmission ? 'bg-brand/10 text-brand' : 'bg-brand text-white'
        }`}
      >
        {mySubmission ? '✓ ทำแล้ว (แตะเพื่อยกเลิก)' : 'ทำแล้ว'}
      </button>
      {toggle.isError && (
        <p className="mt-2 text-center text-sm text-danger">บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง</p>
      )}
    </div>
  );
}

export default function Homework() {
  const { profile } = useAuth();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['homework-tasks'],
    queryFn: fetchTasks,
  });
  const [statusTask, setStatusTask] = useState<HomeworkTask | null>(null);
  const [editTask, setEditTask] = useState<HomeworkTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HomeworkTask | null>(null);
  const queryClient = useQueryClient();

  // Firestore ไม่ลบ subcollection ให้อัตโนมัติ — ลบ submissions ก่อนแล้วค่อยลบตัวงาน
  const remove = useMutation({
    mutationFn: async (task: HomeworkTask) => {
      const subs = await getDocs(collection(db, 'homework', task.id, 'submissions'));
      for (let i = 0; i < subs.docs.length; i += 400) {
        const batch = writeBatch(db);
        subs.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      await deleteDoc(doc(db, 'homework', task.id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['homework-tasks'] });
      setDeleteTarget(null);
    },
  });

  const deleteError = remove.isError
    ? (remove.error as { code?: string })?.code === 'permission-denied'
      ? 'ลบไม่สำเร็จ: ไม่มีสิทธิ์ (ตรวจ Firestore rules ของ homework และ submissions)'
      : 'ลบไม่สำเร็จ ลองใหม่อีกครั้ง'
    : '';

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-brand">📚 ติดตาม & ส่งงาน</h1>

      {profile?.role === 'admin' && <CreateTask />}

      {isLoading ? (
        <p className="text-sm text-gray-400">กำลังโหลดรายการงาน...</p>
      ) : tasks.length === 0 ? (
        <div className="glass-card p-6 text-center text-sm text-gray-500">ยังไม่มีงานที่มอบหมาย</div>
      ) : profile?.role === 'admin' ? (
        <ul className="flex flex-col gap-2">
          {tasks.map((t) => (
            <li key={t.id} className="glass-card p-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-brand">{t.subject}</p>
                <p className="font-semibold">{t.title}</p>
                {t.detail && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-500">{t.detail}</p>
                )}
                <p className="mt-1 text-xs text-gray-400">กำหนดส่ง {t.deadline}</p>
              </div>
              <TaskImages images={t.images} />
              <TaskLinks links={t.links} />
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => setStatusTask(t)}
                  className="flex-1 rounded-xl bg-brand/10 px-3 py-2 text-sm font-semibold text-brand"
                >
                  ดูสถานะ
                </button>
                <button
                  onClick={() => setEditTask(t)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  aria-label={`แก้ไขงาน ${t.title}`}
                >
                  ✏️ แก้ไข
                </button>
                <button
                  onClick={() => {
                    remove.reset();
                    setDeleteTarget(t);
                  }}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-danger"
                  aria-label={`ลบงาน ${t.title}`}
                >
                  🗑 ลบ
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map((t) => (
            <StudentTaskCard key={t.id} task={t} />
          ))}
        </div>
      )}

      {statusTask && <StatusModal task={statusTask} onClose={() => setStatusTask(null)} />}

      {editTask && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto">
            <TaskForm key={editTask.id} task={editTask} onClose={() => setEditTask(null)} />
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDeleteDialog
          task={deleteTarget}
          pending={remove.isPending}
          errorText={deleteError}
          onConfirm={() => remove.mutate(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
