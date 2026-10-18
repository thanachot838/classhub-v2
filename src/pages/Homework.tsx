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
import { useAuth } from '../context/AuthContext';
import type { AppUser, HomeworkSubmission, HomeworkTask } from '../types';

// โมดูล 2: Admin สร้าง/ลบงาน + แนบลิงก์ (Padlet, Google Drive) · นักเรียนติ๊ก "ทำแล้ว" · Modal ตรวจงาน
// homework/{taskId} (db=primary) + subcollection submissions/{uid}

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

function deadlineBadge(deadline: string) {
  const today = new Date().toISOString().slice(0, 10);
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

/** ฟอร์มสร้างงานใหม่ (Admin) */
function CreateTaskForm() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [deadline, setDeadline] = useState(new Date().toISOString().slice(0, 10));
  const [links, setLinks] = useState<string[]>(['']);
  const [open, setOpen] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('missing');
      const cleaned: string[] = [];
      for (const raw of links) {
        if (!raw.trim()) continue;
        const url = normalizeUrl(raw);
        if (!url) throw new Error('bad-link');
        cleaned.push(url);
      }
      await addDoc(collection(db, 'homework'), {
        subject,
        title,
        detail,
        deadline,
        links: cleaned,
        createdBy: profile.uid,
        createdAt: serverTimestamp(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['homework-tasks'] });
      setSubject('');
      setTitle('');
      setDetail('');
      setLinks(['']);
      setOpen(false);
    },
  });

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

  return (
    <section className="glass-card flex flex-col gap-3 p-4">
      <h2 className="font-semibold">สร้างงานใหม่</h2>
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
      {create.isError && (
        <p className="text-sm text-danger">
          {create.error instanceof Error && create.error.message === 'bad-link'
            ? 'ลิงก์ไม่ถูกต้อง ตรวจสอบอีกครั้ง (ต้องเป็น http/https)'
            : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง'}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="flex-1 rounded-xl border border-gray-300 py-2 text-sm"
        >
          ยกเลิก
        </button>
        <button
          disabled={!subject || !title || create.isPending}
          onClick={() => create.mutate()}
          className="flex-1 rounded-xl bg-brand py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {create.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </section>
  );
}

/** Modal ตรวจหลักฐานของงานหนึ่งชิ้น (Admin) */
function SubmissionsModal({ task, onClose }: { task: HomeworkTask; onClose: () => void }) {
  const { data: students = [] } = useQuery({ queryKey: ['students'], queryFn: fetchStudents });
  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ['homework-submissions', task.id],
    queryFn: () => fetchSubmissions(task.id),
  });
  const queryClient = useQueryClient();
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);

  const verify = useMutation({
    mutationFn: async (uid: string) => {
      const ref = doc(db, 'homework', task.id, 'submissions', uid);
      await updateDoc(ref, { verified: true });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['homework-submissions', task.id] }),
  });

  const byUid = new Map(submissions.map((s) => [s.uid, s]));

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="glass-card max-h-[85vh] w-full max-w-md overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">{task.title}</h2>
          <button onClick={onClose} className="text-gray-400" aria-label="ปิด">
            ✕
          </button>
        </div>
        {isLoading ? (
          <p className="text-sm text-gray-400">กำลังโหลด...</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {students.map((s) => {
              const sub = byUid.get(s.uid);
              return (
                <li
                  key={s.uid}
                  className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2"
                >
                  <span className="text-sm">
                    {s.number}. {s.name}
                  </span>
                  <div className="flex items-center gap-2">
                    {sub ? (
                      <>
                        {sub.proofUrl && (
                          <button
                            onClick={() => setViewingUrl(sub.proofUrl ?? null)}
                            className="text-xs text-brand underline"
                          >
                            ดูรูป
                          </button>
                        )}
                        {sub.verified ? (
                          <span className="status-chip ok">ตรวจแล้ว</span>
                        ) : (
                          <button
                            onClick={() => verify.mutate(s.uid)}
                            className="status-chip pending"
                          >
                            รอตรวจ · แตะเพื่อยืนยัน
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="status-chip danger">ยังไม่ส่ง</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {viewingUrl && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
            onClick={() => setViewingUrl(null)}
          >
            <img src={viewingUrl} alt="หลักฐานการบ้าน" className="max-h-[80vh] max-w-full rounded-xl" />
          </div>
        )}
      </div>
    </div>
  );
}

/** การ์ดงาน 1 ชิ้น มุมมองนักเรียน — ติ๊กว่าทำแล้ว (ไม่ต้องส่งรูป) */
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
        {deadlineBadge(task.deadline)}
      </div>
      <h3 className="font-semibold">{task.title}</h3>
      {task.detail && <p className="mt-1 text-sm text-gray-500">{task.detail}</p>}
      <p className="mt-1 text-xs text-gray-400">กำหนดส่ง {task.deadline}</p>
      <TaskLinks links={task.links} />

      {mySubmission?.verified ? (
        <div className="mt-3 flex items-center gap-2">
          <span className="status-chip ok">ตรวจแล้ว ✅</span>
          {mySubmission.proofUrl && (
            <a href={mySubmission.proofUrl} target="_blank" rel="noreferrer" className="text-xs text-brand underline">
              ดูรูปที่ส่ง
            </a>
          )}
        </div>
      ) : (
        <>
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
          {mySubmission && <p className="mt-2 text-center text-xs text-gray-400">รอครูตรวจ ⏳</p>}
          {toggle.isError && (
            <p className="mt-2 text-center text-sm text-danger">บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง</p>
          )}
        </>
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
  const [modalTask, setModalTask] = useState<HomeworkTask | null>(null);
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['homework-tasks'] }),
  });

  function confirmDelete(t: HomeworkTask) {
    if (window.confirm(`ลบงาน "${t.title}" ?\nข้อมูลการส่งงานของนักเรียนจะถูกลบด้วย`)) remove.mutate(t);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-brand">📚 ติดตาม & ส่งงาน</h1>

      {profile?.role === 'admin' && <CreateTaskForm />}

      {isLoading ? (
        <p className="text-sm text-gray-400">กำลังโหลดรายการงาน...</p>
      ) : tasks.length === 0 ? (
        <div className="glass-card p-6 text-center text-sm text-gray-500">ยังไม่มีงานที่มอบหมาย</div>
      ) : profile?.role === 'admin' ? (
        <ul className="flex flex-col gap-2">
          {tasks.map((t) => (
            <li key={t.id} className="glass-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-brand">{t.subject}</p>
                  <p className="font-semibold">{t.title}</p>
                  <p className="text-xs text-gray-400">กำหนดส่ง {t.deadline}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => confirmDelete(t)}
                    disabled={remove.isPending}
                    className="rounded-xl px-3 py-2 text-sm text-danger disabled:opacity-40"
                    aria-label={`ลบงาน ${t.title}`}
                  >
                    🗑
                  </button>
                  <button
                    onClick={() => setModalTask(t)}
                    className="rounded-xl bg-brand/10 px-3 py-2 text-sm font-semibold text-brand"
                  >
                    ตรวจงาน
                  </button>
                </div>
              </div>
              <TaskLinks links={t.links} />
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

      {remove.isError && <p className="text-sm text-danger">ลบไม่สำเร็จ ลองใหม่อีกครั้ง</p>}
      {modalTask && <SubmissionsModal task={modalTask} onClose={() => setModalTask(null)} />}
    </div>
  );
}
