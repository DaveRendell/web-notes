package dev.webnotes.fastsaf

import android.net.Uri
import android.provider.DocumentsContract
import android.util.Base64
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException

class FastSafModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FastSaf")

    AsyncFunction("writeText") Coroutine { uriString: String, text: String ->
      withContext(Dispatchers.IO) {
        val context = appContext.reactContext ?: throw Exceptions.AppContextLost()
        val uri = Uri.parse(uriString)
        require(uri.scheme == "content") { "Expected a document URI" }
        // "w" is provider-dependent and can leave a previous, longer note's tail.
        // Explicit truncation is essential for exact-byte conflict detection.
        val stream = context.contentResolver.openOutputStream(uri, "wt")
          ?: throw IOException("The document provider could not open the note for writing")
        stream.bufferedWriter(Charsets.UTF_8).use { it.write(text) }
      }
    }

    AsyncFunction("writeBase64") Coroutine { uriString: String, value: String ->
      withContext(Dispatchers.IO) {
        val context = appContext.reactContext ?: throw Exceptions.AppContextLost()
        val uri = Uri.parse(uriString)
        require(uri.scheme == "content") { "Expected a document URI" }
        val stream = context.contentResolver.openOutputStream(uri, "wt")
          ?: throw IOException("The document provider could not open the image for writing")
        stream.use { it.write(Base64.decode(value, Base64.DEFAULT)) }
      }
    }

    AsyncFunction("listChildren") Coroutine { rootUriString: String, folderUriString: String ->
      withContext(Dispatchers.IO) {
        val context = appContext.reactContext ?: throw Exceptions.AppContextLost()
        val rootUri = Uri.parse(rootUriString)
        val folderUri = Uri.parse(folderUriString)
        require(rootUri.scheme == "content" && rootUri.authority == folderUri.authority) {
          "Folder must belong to the selected document provider"
        }

        val rootDocumentId = DocumentsContract.getTreeDocumentId(rootUri)
        val folderDocumentId = if (rootUriString == folderUriString) {
          rootDocumentId
        } else {
          DocumentsContract.getDocumentId(folderUri)
        }
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(rootUri, folderDocumentId)
        val projection = arrayOf(
          DocumentsContract.Document.COLUMN_DOCUMENT_ID,
          DocumentsContract.Document.COLUMN_DISPLAY_NAME,
          DocumentsContract.Document.COLUMN_MIME_TYPE,
          DocumentsContract.Document.COLUMN_SIZE
        )
        val results = mutableListOf<Map<String, Any>>()
        val cursor = context.contentResolver.query(childrenUri, projection, null, null, null)
          ?: throw IOException("The document provider returned no directory listing")
        cursor.use {
          val idColumn = it.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
          val nameColumn = it.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
          val typeColumn = it.getColumnIndexOrThrow(DocumentsContract.Document.COLUMN_MIME_TYPE)
          val sizeColumn = it.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE)
          while (it.moveToNext()) {
            val documentId = it.getString(idColumn) ?: continue
            val name = it.getString(nameColumn) ?: continue
            val mimeType = it.getString(typeColumn)
            val item = mutableMapOf<String, Any>(
                "uri" to DocumentsContract.buildDocumentUriUsingTree(rootUri, documentId).toString(),
                "name" to name,
                "isDirectory" to (mimeType == DocumentsContract.Document.MIME_TYPE_DIR),
                "mimeType" to (mimeType ?: "application/octet-stream")
            )
            if (sizeColumn >= 0 && !it.isNull(sizeColumn)) item["size"] = it.getLong(sizeColumn).toDouble()
            results.add(item)
          }
        }
        results
      }
    }
  }
}
