import { useEffect, useState } from "react";
import {
   ShareNetwork,
   Copy,
   XCircle,
   ArrowClockwise,
} from "@phosphor-icons/react";
import { authenticatedFetch } from "../lib/authenticatedFetch";
import { API_BASE_URL } from "../lib/api";
import "./BookmarkSharing.css";

export default function BookmarkSharing({ ownerId }) {
   const [status, setStatus] = useState(null);
   const [link, setLink] = useState("");
   const [pending, setPending] = useState(false);
   const [error, setError] = useState("");
   const [copied, setCopied] = useState(false);
   const [loadAttempt, setLoadAttempt] = useState(0);

   useEffect(() => {
      if (!ownerId) return;
      let current = true;
      authenticatedFetch(
         `${API_BASE_URL}/api/bookmark-shares/status`,
      )
         .then(async (response) => {
            if (!response.ok)
               throw new Error(
                  "Could not load sharing status",
               );
            const data = await response.json();
            if (current) setStatus(data);
         })
         .catch((err) => {
            if (current) setError(err.message);
         });
      return () => {
         current = false;
      };
   }, [ownerId, loadAttempt]);

   async function changeLink(revoke) {
      setPending(true);
      setError("");
      try {
         const response = await authenticatedFetch(
            `${API_BASE_URL}/api/bookmark-shares`,
            {
               method: revoke ? "DELETE" : "POST",
            },
         );
         if (!response.ok)
            throw new Error(
               revoke
                  ? "Could not revoke share link"
                  : "Could not create share link",
            );
         if (revoke) {
            setStatus({ active: false });
            setLink("");
         } else {
            const data = await response.json();
            setLink(
               `${window.location.origin}/shared-bookmarks#${data.token}`,
            );
            setStatus({
               active: true,
               expires_at: data.expires_at,
            });
         }
         setCopied(false);
      } catch (err) {
         setError(err.message);
      } finally {
         setPending(false);
      }
   }

   async function copyLink() {
      try {
         await navigator.clipboard.writeText(link);
         setCopied(true);
      } catch {
         setError("Could not copy link");
      }
   }

   if (!ownerId) return null;
   return (
      <div className="bookmark-sharing">
         <div className="bookmark-sharing-actions">
            {!status && error && (
               <button
                  aria-label="Retry sharing status"
                  title="Retry sharing status"
                  onClick={() => {
                     setError("");
                     setLoadAttempt(
                        (attempt) => attempt + 1,
                     );
                  }}
               >
                  <ArrowClockwise size={18} />
               </button>
            )}
            <button
               disabled={pending || !status}
               onClick={() => changeLink(false)}
               title="Anyone with a share link can view your saved restaurants"
            >
               <ShareNetwork size={18} />
               {status?.active
                  ? "Replace share link"
                  : "Create share link"}
            </button>
            {status?.active && (
               <button
                  disabled={pending}
                  onClick={() => changeLink(true)}
                  title="Revoke share link"
               >
                  <XCircle size={18} />
                  Revoke
               </button>
            )}
         </div>
         {status && (
            <p>
               {status.active
                  ? `Link expires ${new Date(status.expires_at).toLocaleDateString()}`
                  : "Private bookmarks"}
            </p>
         )}
         {link && (
            <div className="bookmark-link">
               <input
                  aria-label="Bookmark share link"
                  readOnly
                  value={link}
               />
               <button
                  onClick={copyLink}
                  title={
                     copied ? "Copied" : "Copy share link"
                  }
                  aria-label="Copy share link"
               >
                  <Copy size={18} />
               </button>
               {copied && <span role="status">Copied</span>}
            </div>
         )}
         {error && <p role="alert">{error}</p>}
      </div>
   );
}
