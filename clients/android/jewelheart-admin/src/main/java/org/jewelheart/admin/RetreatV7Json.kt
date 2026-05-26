package org.jewelheart.admin

import com.google.gson.GsonBuilder
import com.google.gson.TypeAdapter
import com.google.gson.stream.JsonReader
import com.google.gson.stream.JsonToken
import com.google.gson.stream.JsonWriter

/** Gson helper: PowerShell ConvertTo-Json may emit instructions as {} instead of []. */
object RetreatV7Json {
    val gson =
        GsonBuilder()
            .registerTypeAdapter(
                object : com.google.gson.reflect.TypeToken<List<String>>() {}.type,
                StringListAdapter(),
            )
            .create()
}

private class StringListAdapter : TypeAdapter<List<String>>() {
    override fun write(out: JsonWriter, value: List<String>?) {
        out.beginArray()
        value?.forEach { out.value(it) }
        out.endArray()
    }

    override fun read(reader: JsonReader): List<String> {
        return when (reader.peek()) {
            JsonToken.NULL -> {
                reader.nextNull()
                emptyList()
            }
            JsonToken.BEGIN_ARRAY -> {
                val list = mutableListOf<String>()
                reader.beginArray()
                while (reader.hasNext()) {
                    if (reader.peek() == JsonToken.NULL) {
                        reader.nextNull()
                    } else {
                        list.add(reader.nextString())
                    }
                }
                reader.endArray()
                list
            }
            JsonToken.BEGIN_OBJECT -> {
                reader.beginObject()
                val list = mutableListOf<String>()
                while (reader.hasNext()) {
                    reader.nextName()
                    if (reader.peek() != JsonToken.NULL) {
                        list.add(reader.nextString())
                    } else {
                        reader.nextNull()
                    }
                }
                reader.endObject()
                list
            }
            JsonToken.STRING -> listOf(reader.nextString())
            else -> {
                reader.skipValue()
                emptyList()
            }
        }
    }
}
